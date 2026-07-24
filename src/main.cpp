// SplitGBA — 4-Spieler-Splitscreen-GBA-Frontend fuer den TV.
//
// Basiert auf libmgba (mGBA-Core). Alle Instanzen laufen in einem Fenster
// (2x2-Raster), sind ueber mGBAs Lockstep-Link verbunden (Link-Kabel fuer
// Pokemon-Tausch/-Kampf), teilen sich eine globale Geschwindigkeitsregelung
// (1x-4x) und einen Race-Timer.
//
// Die Lockstep-Verkabelung folgt 1:1 dem MultiplayerController des
// offiziellen mGBA-Qt-Frontends (third_party/mgba/src/platform/qt).

#include <SDL.h>

#include <mgba/core/blip_buf.h>
#include <mgba/core/config.h>
#include <mgba/core/core.h>
#include <mgba/core/log.h>
#include <mgba/core/serialize.h>
#include <mgba/core/thread.h>
#include <mgba/gba/interface.h>
#include <mgba/internal/gba/audio.h>
#include <mgba/internal/gba/gba.h>
#include <mgba/internal/gba/input.h>
#include <mgba/internal/gba/sio.h>
#include <mgba/internal/gba/sio/lockstep.h>
#include <mgba-util/vfs.h>

#include <fcntl.h>
#include <sys/stat.h>

#include <algorithm>
#include <atomic>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <dirent.h>
#include <mutex>
#include <string>
#include <vector>

#include "font5x7.h"

static_assert(sizeof(color_t) == 4, "libmgba muss ohne COLOR_16_BIT gebaut sein");

static constexpr int GBA_SCREEN_W = GBA_VIDEO_HORIZONTAL_PIXELS;
static constexpr int GBA_SCREEN_H = GBA_VIDEO_VERTICAL_PIXELS;
static constexpr float BASE_FPS = 60.0f;
static constexpr int MAX_PLAYERS = 4;
static constexpr float SPEED_TABLE[] = {1.0f, 2.0f, 3.0f, 4.0f};

// ---------------------------------------------------------------------------
// Datenstrukturen

struct Player {
	struct mCore* core = nullptr;
	struct mCoreThread thread = {};
	struct GBASIOLockstepNode* node = nullptr;
	std::string romPath;
	std::string label;

	uint32_t* videoBuffer = nullptr;  // schreibt der Core (Core-Thread)
	uint32_t* frontBuffer = nullptr;  // Kopie fuer den Render-Thread
	std::mutex frameMutex;
	std::atomic<bool> frameDirty{false};
	std::atomic<uint64_t> frameCount{0};
	std::atomic<bool> audioReady{false};
	std::atomic<bool> syncEnabled{false};

	// Lockstep-Buchhaltung (entspricht MultiplayerController::Player)
	int awake = 1;
	int32_t cyclesPosted = 0;
	unsigned waitMask = 0;

	// Drossel-Fallback wenn kein Audiogeraet verfuegbar ist
	uint64_t nextDue = 0;

	SDL_Texture* tex = nullptr;
	SDL_GameController* pad = nullptr;
	SDL_JoystickID padId = -1;
	uint16_t padKeys = 0;
};

struct App {
	union {
		struct mLockstep lockstep;
		struct GBASIOLockstep gbaLockstep;
	};
	std::mutex lockstepMutex;
	bool linked = false;
	bool linkEnabled = true;

	int numPlayers = 0;
	std::atomic<int> speedIdx{0};
	std::atomic<bool> turbo{false};
	bool audioOk = false;
	bool freeRun = false;  // Screenshot-/Testmodus: ungebremst laufen lassen
	SDL_AudioDeviceID audioDev = 0;
	SDL_AudioSpec audioSpec = {};

	bool paused = false;
	bool timerWasRunning = false;

	// Race-Timer
	std::atomic<bool> timerRunning{false};
	uint64_t timerAccumMs = 0;
	uint64_t timerStartTick = 0;

	// Einstellungen (Menue, persistiert in ~/.config/splitgba.ini)
	std::string playerName[MAX_PLAYERS];
	std::atomic<int> playerVol[MAX_PLAYERS] = {100, 100, 100, 100};  // Prozent, 0-150
	std::atomic<bool> masterMute{false};
	std::atomic<int> timerMode{1};  // 0=aus, 1=Stoppuhr, 2=Countdown
	std::atomic<int> countdownMin{30};

	// Menue-Zustand
	bool menuOpen = false;
	int menuSel = 0;
	bool editingName = false;
	int editingIndex = -1;
	std::string editBuffer;
	bool pausedBeforeMenu = false;

	bool hudVisible = true;
	bool fullscreen = false;
	bool smooth = false;

	SDL_Window* window = nullptr;
	SDL_Renderer* renderer = nullptr;
	SDL_Texture* fontTex = nullptr;
	uint16_t keyboardKeys = 0;
};

static App g_app;
static Player g_players[MAX_PLAYERS];

// ---------------------------------------------------------------------------
// Logging: mGBA-Meldungen nur bei Fehlern durchreichen

static void quietLog(struct mLogger*, int, enum mLogLevel level, const char* format, va_list args) {
	if (level & (mLOG_ERROR | mLOG_FATAL)) {
		vfprintf(stderr, format, args);
		fputc('\n', stderr);
	}
}

static struct mLogger s_logger = {};

// ---------------------------------------------------------------------------
// Sync & Geschwindigkeit

static float currentSpeed() {
	return g_app.turbo.load() ? 4.0f : SPEED_TABLE[g_app.speedIdx.load()];
}

// Entspricht CoreController::setSync: an = Spieler taktet sich selbst (Audio),
// aus = der Lockstep-Master gibt den Takt vor.
static void playerSetSync(Player* p, bool sync) {
	if (!p->thread.impl) {
		return;
	}
	if (sync) {
		p->thread.impl->sync.audioWait = g_app.audioOk && !g_app.freeRun;
		p->thread.impl->sync.videoFrameWait = false;
		p->syncEnabled.store(!g_app.freeRun);
	} else {
		p->thread.impl->sync.audioWait = false;
		p->thread.impl->sync.videoFrameWait = false;
		p->syncEnabled.store(false);
	}
}

static void applySpeed() {
	float mult = currentSpeed();
	for (int i = 0; i < g_app.numPlayers; ++i) {
		if (g_players[i].thread.impl) {
			g_players[i].thread.impl->sync.fpsTarget = BASE_FPS * mult;
		}
	}
}

// Fallback-Drossel: haelt die Framerate, falls kein Audiogeraet den Takt vorgibt.
static void throttlePlayer(Player* p) {
	float fps = BASE_FPS * currentSpeed();
	uint64_t period = SDL_GetPerformanceFrequency() / (uint64_t)fps;
	uint64_t now = SDL_GetPerformanceCounter();
	if (p->nextDue == 0 || now > p->nextDue + period * 30) {
		p->nextDue = now;
	}
	p->nextDue += period;
	if (now < p->nextDue) {
		uint32_t ms = (uint32_t)((p->nextDue - now) * 1000 / SDL_GetPerformanceFrequency());
		if (ms > 0) {
			SDL_Delay(ms);
		}
	}
}

static void frameCallback(struct mCoreThread* thread) {
	Player* p = static_cast<Player*>(thread->userData);
	{
		std::lock_guard<std::mutex> guard(p->frameMutex);
		memcpy(p->frontBuffer, p->videoBuffer, GBA_SCREEN_W * GBA_SCREEN_H * sizeof(uint32_t));
	}
	p->frameDirty.store(true);
	p->frameCount.fetch_add(1);
	if (!g_app.audioOk && !g_app.freeRun && p->syncEnabled.load()) {
		throttlePlayer(p);
	}
}

// ---------------------------------------------------------------------------
// Lockstep-Callbacks — direkte Uebersetzung von MultiplayerController.cpp

static void lockstepLock(struct mLockstep*) {
	g_app.lockstepMutex.lock();
}

static void lockstepUnlock(struct mLockstep*) {
	g_app.lockstepMutex.unlock();
}

static bool lockstepSignal(struct mLockstep*, unsigned mask) {
	Player* player = &g_players[0];
	bool woke = false;
	player->waitMask &= ~mask;
	if (!player->waitMask && player->awake < 1) {
		mCoreThreadStopWaiting(&player->thread);
		player->awake = 1;
		woke = true;
	}
	return woke;
}

static bool lockstepWait(struct mLockstep*, unsigned mask) {
	Player* player = &g_players[0];
	bool slept = false;
	player->waitMask |= mask;
	if (player->awake > 0) {
		mCoreThreadWaitFromThread(&player->thread);
		player->awake = 0;
		slept = true;
	}
	playerSetSync(player, true);
	return slept;
}

static void lockstepAddCycles(struct mLockstep*, int id, int32_t cycles) {
	if (cycles < 0) {
		abort();
	}
	if (!id) {
		for (int i = 1; i < g_app.numPlayers; ++i) {
			Player* player = &g_players[i];
			if (player->node->d.p->mode > SIO_MULTI) {
				playerSetSync(player, true);
				continue;
			}
			playerSetSync(player, false);
			player->cyclesPosted += cycles;
			if (player->awake < 1) {
				player->node->nextEvent += player->cyclesPosted;
			}
			mCoreThreadStopWaiting(&player->thread);
			player->awake = 1;
		}
	} else {
		Player* player = &g_players[id];
		playerSetSync(player, true);
		player->cyclesPosted += cycles;
	}
}

static int32_t lockstepUseCycles(struct mLockstep*, int id, int32_t cycles) {
	Player* player = &g_players[id];
	player->cyclesPosted -= cycles;
	if (player->cyclesPosted <= 0) {
		mCoreThreadWaitFromThread(&player->thread);
		player->awake = 0;
	}
	return player->cyclesPosted;
}

static int32_t lockstepUnusedCycles(struct mLockstep*, int id) {
	return g_players[id].cyclesPosted;
}

static void lockstepUnload(struct mLockstep* lockstep, int id) {
	if (id) {
		Player* player = &g_players[id];
		playerSetSync(player, true);
		player->cyclesPosted = 0;

		// Master freigeben, falls er auf diesen Spieler wartet
		player = &g_players[0];
		player->waitMask &= ~(1 << id);
		if (!player->waitMask && player->awake < 1) {
			mCoreThreadStopWaiting(&player->thread);
			player->awake = 1;
		}
	} else {
		for (int i = 1; i < g_app.numPlayers; ++i) {
			Player* player = &g_players[i];
			playerSetSync(player, true);
			player->cyclesPosted += reinterpret_cast<struct GBASIOLockstep*>(lockstep)->players[0]->eventDiff;
			if (player->awake < 1) {
				player->node->nextEvent += player->cyclesPosted;
				mCoreThreadStopWaiting(&player->thread);
				player->awake = 1;
			}
		}
	}
}

static void interruptAll() {
	for (int i = 0; i < g_app.numPlayers; ++i) {
		mCoreThreadInterrupt(&g_players[i].thread);
	}
}

static void continueAll() {
	for (int i = 0; i < g_app.numPlayers; ++i) {
		mCoreThreadContinue(&g_players[i].thread);
	}
}

static void attachLink() {
	if (g_app.numPlayers < 2 || !g_app.linkEnabled) {
		return;
	}
	mLockstepInit(&g_app.lockstep);
	g_app.lockstep.context = &g_app;
	g_app.lockstep.lock = lockstepLock;
	g_app.lockstep.unlock = lockstepUnlock;
	g_app.lockstep.signal = lockstepSignal;
	g_app.lockstep.wait = lockstepWait;
	g_app.lockstep.addCycles = lockstepAddCycles;
	g_app.lockstep.useCycles = lockstepUseCycles;
	g_app.lockstep.unusedCycles = lockstepUnusedCycles;
	g_app.lockstep.unload = lockstepUnload;
	GBASIOLockstepInit(&g_app.gbaLockstep);

	interruptAll();
	for (int i = 0; i < g_app.numPlayers; ++i) {
		Player* p = &g_players[i];
		struct GBA* gba = static_cast<struct GBA*>(p->core->board);
		p->node = new GBASIOLockstepNode();
		GBASIOLockstepNodeCreate(p->node);
		GBASIOLockstepAttachNode(&g_app.gbaLockstep, p->node);
		GBASIOSetDriver(&gba->sio, &p->node->d, SIO_MULTI);
		GBASIOSetDriver(&gba->sio, &p->node->d, SIO_NORMAL_32);
	}
	continueAll();
	g_app.linked = true;
}

static void detachLink() {
	if (!g_app.linked) {
		return;
	}
	interruptAll();
	for (int i = 0; i < g_app.numPlayers; ++i) {
		Player* p = &g_players[i];
		struct GBA* gba = static_cast<struct GBA*>(p->core->board);
		GBASIOSetDriver(&gba->sio, nullptr, SIO_MULTI);
		GBASIOSetDriver(&gba->sio, nullptr, SIO_NORMAL_32);
		if (p->node) {
			GBASIOLockstepDetachNode(&g_app.gbaLockstep, p->node);
			delete p->node;
			p->node = nullptr;
		}
	}
	continueAll();
	g_app.linked = false;
	mLockstepDeinit(&g_app.lockstep);
}

// ---------------------------------------------------------------------------
// Audio: ein Geraet, alle Cores werden gemischt

static int mixGain(int playerIndex) {
	if (g_app.masterMute.load()) {
		return 0;
	}
	int base;
	switch (g_app.numPlayers) {
	case 1: base = 256; break;
	case 2: base = 144; break;
	case 3: base = 112; break;
	default: base = 96; break;
	}
	int vol = std::clamp(g_app.playerVol[playerIndex].load(), 0, 150);
	return base * vol / 100;
}

static void audioCallback(void*, Uint8* stream, int len) {
	memset(stream, 0, len);
	int16_t* out = reinterpret_cast<int16_t*>(stream);
	int frames = len / (2 * sizeof(int16_t));
	static std::vector<int16_t> tmp;
	tmp.assign(frames * 2, 0);

	for (int i = 0; i < g_app.numPlayers; ++i) {
		Player* p = &g_players[i];
		if (!p->audioReady.load() || !p->thread.impl) {
			continue;
		}
		struct mCoreSync* sync = &p->thread.impl->sync;
		blip_t* left = p->core->getAudioChannel(p->core, 0);
		blip_t* right = p->core->getAudioChannel(p->core, 1);
		int32_t clockRate = p->core->frequency(p->core);
		double fauxClock = 1;
		if (sync->fpsTarget > 0) {
			fauxClock = GBAAudioCalculateRatio(1, sync->fpsTarget, 1);
		}
		mCoreSyncLockAudio(sync);
		blip_set_rates(left, clockRate, g_app.audioSpec.freq * fauxClock);
		blip_set_rates(right, clockRate, g_app.audioSpec.freq * fauxClock);
		int avail = blip_samples_avail(left);
		if (avail > frames) {
			avail = frames;
		}
		blip_read_samples(left, tmp.data(), avail, 1);
		blip_read_samples(right, tmp.data() + 1, avail, 1);
		mCoreSyncConsumeAudio(sync);

		int gain = mixGain(i);
		if (gain > 0) {
			for (int s = 0; s < avail * 2; ++s) {
				int v = out[s] + ((tmp[s] * gain) >> 8);
				out[s] = (int16_t)std::clamp(v, -32768, 32767);
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Spieler-Lebenszyklus

static std::string stripExtension(const std::string& path) {
	size_t dot = path.find_last_of('.');
	size_t slash = path.find_last_of('/');
	if (dot == std::string::npos || (slash != std::string::npos && dot < slash)) {
		return path;
	}
	return path.substr(0, dot);
}

static std::string baseName(const std::string& path) {
	size_t slash = path.find_last_of('/');
	return slash == std::string::npos ? path : path.substr(slash + 1);
}

static std::string savePathFor(const Player& p, int index, bool dupRom) {
	if (!dupRom) {
		return "";  // Standard: .sav neben dem ROM (mCoreAutoloadSave)
	}
	return stripExtension(p.romPath) + ".p" + std::to_string(index + 1) + ".sav";
}

static std::string statePathFor(const Player& p, int index) {
	return stripExtension(p.romPath) + ".p" + std::to_string(index + 1) + ".ss1";
}

static bool bootPlayer(Player& p, int index, const std::string& rom, bool dupRom) {
	p.romPath = rom;
	p.core = mCoreFind(rom.c_str());
	if (!p.core) {
		fprintf(stderr, "Spieler %d: '%s' ist kein lesbares GBA-ROM\n", index + 1, rom.c_str());
		return false;
	}
	if (!p.core->init(p.core)) {
		fprintf(stderr, "Spieler %d: Core-Init fehlgeschlagen\n", index + 1);
		return false;
	}
	if (p.core->platform(p.core) != mPLATFORM_GBA) {
		fprintf(stderr, "Spieler %d: '%s' ist kein GBA-Spiel (GB/GBC wird nicht unterstuetzt)\n",
		        index + 1, rom.c_str());
		return false;
	}

	mCoreInitConfig(p.core, "splitgba");
	struct mCoreOptions opts = {};
	opts.useBios = true;
	opts.audioBuffers = 1024;
	opts.volume = 0x100;
	opts.audioSync = true;
	opts.videoSync = false;
	opts.fpsTarget = BASE_FPS;
	opts.logLevel = mLOG_WARN | mLOG_ERROR | mLOG_FATAL;
	mCoreConfigLoadDefaults(&p.core->config, &opts);
	mCoreLoadConfig(p.core);

	p.videoBuffer = new uint32_t[GBA_SCREEN_W * GBA_SCREEN_H];
	p.frontBuffer = new uint32_t[GBA_SCREEN_W * GBA_SCREEN_H]();
	p.core->setVideoBuffer(p.core, reinterpret_cast<color_t*>(p.videoBuffer), GBA_SCREEN_W);
	p.core->setAudioBufferSize(p.core, 1024);

	if (!mCoreLoadFile(p.core, rom.c_str())) {
		fprintf(stderr, "Spieler %d: konnte '%s' nicht laden\n", index + 1, rom.c_str());
		return false;
	}

	std::string savPath = savePathFor(p, index, dupRom);
	if (savPath.empty()) {
		mCoreAutoloadSave(p.core);
	} else {
		struct VFile* sav = VFileOpen(savPath.c_str(), O_CREAT | O_RDWR);
		if (sav) {
			p.core->loadSave(p.core, sav);
		}
	}

	std::string title = baseName(stripExtension(rom));
	std::transform(title.begin(), title.end(), title.begin(), ::toupper);
	if (title.size() > 20) {
		title.resize(20);
	}
	p.label = title;

	p.thread = {};
	p.thread.core = p.core;
	p.thread.userData = &p;
	p.thread.frameCallback = frameCallback;

	if (!mCoreThreadStart(&p.thread)) {
		fprintf(stderr, "Spieler %d: Emulations-Thread startete nicht\n", index + 1);
		return false;
	}
	p.thread.impl->sync.fpsTarget = BASE_FPS;
	playerSetSync(&p, true);
	p.audioReady.store(true);
	return true;
}

static void shutdownPlayers() {
	if (g_app.audioDev) {
		SDL_PauseAudioDevice(g_app.audioDev, 1);
	}
	for (int i = 0; i < g_app.numPlayers; ++i) {
		g_players[i].audioReady.store(false);
	}
	detachLink();
	for (int i = 0; i < g_app.numPlayers; ++i) {
		Player& p = g_players[i];
		if (p.thread.impl) {
			mCoreThreadEnd(&p.thread);
			mCoreThreadJoin(&p.thread);
		}
		if (p.core) {
			mCoreConfigDeinit(&p.core->config);
			p.core->deinit(p.core);
			p.core = nullptr;
		}
		delete[] p.videoBuffer;
		delete[] p.frontBuffer;
		p.videoBuffer = p.frontBuffer = nullptr;
		if (p.pad) {
			SDL_GameControllerClose(p.pad);
			p.pad = nullptr;
		}
	}
	if (g_app.audioDev) {
		SDL_CloseAudioDevice(g_app.audioDev);
		g_app.audioDev = 0;
	}
}

// ---------------------------------------------------------------------------
// Savestates (alle Spieler gleichzeitig, damit der Link konsistent bleibt)

static void saveAllStates() {
	interruptAll();
	for (int i = 0; i < g_app.numPlayers; ++i) {
		Player& p = g_players[i];
		std::string path = statePathFor(p, i);
		struct VFile* vf = VFileOpen(path.c_str(), O_CREAT | O_TRUNC | O_RDWR);
		if (vf) {
			mCoreSaveStateNamed(p.core, vf, SAVESTATE_SAVEDATA | SAVESTATE_RTC);
			vf->close(vf);
			printf("Savestate gespeichert: %s\n", path.c_str());
		}
	}
	continueAll();
}

static void loadAllStates() {
	interruptAll();
	for (int i = 0; i < g_app.numPlayers; ++i) {
		Player& p = g_players[i];
		std::string path = statePathFor(p, i);
		struct VFile* vf = VFileOpen(path.c_str(), O_RDONLY);
		if (vf) {
			mCoreLoadStateNamed(p.core, vf, SAVESTATE_RTC);
			vf->close(vf);
			printf("Savestate geladen: %s\n", path.c_str());
		}
	}
	continueAll();
}

// ---------------------------------------------------------------------------
// Race-Timer

static uint64_t timerElapsedMs() {
	uint64_t total = g_app.timerAccumMs;
	if (g_app.timerRunning.load()) {
		total += SDL_GetTicks64() - g_app.timerStartTick;
	}
	return total;
}

static void timerToggle() {
	if (g_app.timerRunning.load()) {
		g_app.timerAccumMs += SDL_GetTicks64() - g_app.timerStartTick;
		g_app.timerRunning.store(false);
	} else {
		g_app.timerStartTick = SDL_GetTicks64();
		g_app.timerRunning.store(true);
	}
}

static void timerReset() {
	g_app.timerAccumMs = 0;
	g_app.timerStartTick = SDL_GetTicks64();
}

static std::string formatTimer(uint64_t ms) {
	char buf[32];
	unsigned minutes = (unsigned)(ms / 60000);
	unsigned seconds = (unsigned)((ms / 1000) % 60);
	unsigned tenths = (unsigned)((ms / 100) % 10);
	snprintf(buf, sizeof(buf), "%02u:%02u.%u", minutes, seconds, tenths);
	return buf;
}

// Anzeigewert je nach Modus: Stoppuhr zaehlt hoch, Countdown herunter.
static uint64_t displayTimerMs() {
	uint64_t elapsed = timerElapsedMs();
	if (g_app.timerMode.load() == 2) {
		uint64_t total = (uint64_t)g_app.countdownMin.load() * 60000;
		return elapsed >= total ? 0 : total - elapsed;
	}
	return elapsed;
}

static bool countdownExpired() {
	if (g_app.timerMode.load() != 2) {
		return false;
	}
	return timerElapsedMs() >= (uint64_t)g_app.countdownMin.load() * 60000;
}

// ---------------------------------------------------------------------------
// Eingabe

static const struct {
	SDL_Scancode sc;
	uint16_t bit;
} KEYBOARD_MAP[] = {
	{SDL_SCANCODE_UP, 1 << GBA_KEY_UP},
	{SDL_SCANCODE_DOWN, 1 << GBA_KEY_DOWN},
	{SDL_SCANCODE_LEFT, 1 << GBA_KEY_LEFT},
	{SDL_SCANCODE_RIGHT, 1 << GBA_KEY_RIGHT},
	{SDL_SCANCODE_X, 1 << GBA_KEY_A},
	{SDL_SCANCODE_Z, 1 << GBA_KEY_B},   // QWERTZ: auch Y
	{SDL_SCANCODE_Y, 1 << GBA_KEY_B},
	{SDL_SCANCODE_A, 1 << GBA_KEY_L},
	{SDL_SCANCODE_S, 1 << GBA_KEY_R},
	{SDL_SCANCODE_RETURN, 1 << GBA_KEY_START},
	{SDL_SCANCODE_BACKSPACE, 1 << GBA_KEY_SELECT},
};

static const struct {
	SDL_GameControllerButton btn;
	uint16_t bit;
} PAD_MAP[] = {
	{SDL_CONTROLLER_BUTTON_A, 1 << GBA_KEY_A},
	{SDL_CONTROLLER_BUTTON_B, 1 << GBA_KEY_B},
	{SDL_CONTROLLER_BUTTON_X, 1 << GBA_KEY_B},
	{SDL_CONTROLLER_BUTTON_Y, 1 << GBA_KEY_A},
	{SDL_CONTROLLER_BUTTON_LEFTSHOULDER, 1 << GBA_KEY_L},
	{SDL_CONTROLLER_BUTTON_RIGHTSHOULDER, 1 << GBA_KEY_R},
	{SDL_CONTROLLER_BUTTON_START, 1 << GBA_KEY_START},
	{SDL_CONTROLLER_BUTTON_BACK, 1 << GBA_KEY_SELECT},
	{SDL_CONTROLLER_BUTTON_DPAD_UP, 1 << GBA_KEY_UP},
	{SDL_CONTROLLER_BUTTON_DPAD_DOWN, 1 << GBA_KEY_DOWN},
	{SDL_CONTROLLER_BUTTON_DPAD_LEFT, 1 << GBA_KEY_LEFT},
	{SDL_CONTROLLER_BUTTON_DPAD_RIGHT, 1 << GBA_KEY_RIGHT},
};

static void updatePadKeys(Player& p) {
	if (!p.pad) {
		p.padKeys = 0;
		return;
	}
	uint16_t keys = 0;
	for (const auto& m : PAD_MAP) {
		if (SDL_GameControllerGetButton(p.pad, m.btn)) {
			keys |= m.bit;
		}
	}
	const int DEAD = 16000;
	int ax = SDL_GameControllerGetAxis(p.pad, SDL_CONTROLLER_AXIS_LEFTX);
	int ay = SDL_GameControllerGetAxis(p.pad, SDL_CONTROLLER_AXIS_LEFTY);
	if (ax < -DEAD) keys |= 1 << GBA_KEY_LEFT;
	if (ax > DEAD) keys |= 1 << GBA_KEY_RIGHT;
	if (ay < -DEAD) keys |= 1 << GBA_KEY_UP;
	if (ay > DEAD) keys |= 1 << GBA_KEY_DOWN;
	p.padKeys = keys;
}

static void assignController(int deviceIndex) {
	SDL_GameController* pad = SDL_GameControllerOpen(deviceIndex);
	if (!pad) {
		return;
	}
	SDL_JoystickID id = SDL_JoystickInstanceID(SDL_GameControllerGetJoystick(pad));
	for (int i = 0; i < g_app.numPlayers; ++i) {
		if (g_players[i].padId == id && g_players[i].pad) {
			SDL_GameControllerClose(pad);
			return;  // schon zugeordnet
		}
	}
	for (int i = 0; i < g_app.numPlayers; ++i) {
		if (!g_players[i].pad) {
			g_players[i].pad = pad;
			g_players[i].padId = id;
			printf("Controller '%s' -> Spieler %d\n", SDL_GameControllerName(pad), i + 1);
			return;
		}
	}
	SDL_GameControllerClose(pad);
}

static void removeController(SDL_JoystickID id) {
	for (int i = 0; i < g_app.numPlayers; ++i) {
		if (g_players[i].padId == id) {
			if (g_players[i].pad) {
				SDL_GameControllerClose(g_players[i].pad);
			}
			g_players[i].pad = nullptr;
			g_players[i].padId = -1;
			g_players[i].padKeys = 0;
			printf("Controller von Spieler %d getrennt\n", i + 1);
		}
	}
}

static void pushInput() {
	for (int i = 0; i < g_app.numPlayers; ++i) {
		Player& p = g_players[i];
		updatePadKeys(p);
		uint16_t keys = p.padKeys;
		if (i == 0) {
			keys |= g_app.keyboardKeys;
		}
		if (p.core) {
			p.core->setKeys(p.core, keys);
		}
	}
}

// ---------------------------------------------------------------------------
// Pause

static void togglePause() {
	if (!g_app.paused) {
		interruptAll();
		g_app.paused = true;
		g_app.timerWasRunning = g_app.timerRunning.load();
		if (g_app.timerWasRunning) {
			timerToggle();
		}
	} else {
		continueAll();
		g_app.paused = false;
		if (g_app.timerWasRunning) {
			timerToggle();
		}
	}
}

// ---------------------------------------------------------------------------
// Einstellungen: Laden/Speichern (~/.config/splitgba.ini)

static std::string settingsPath() {
	const char* home = getenv("HOME");
	std::string dir = std::string(home ? home : ".") + "/.config";
	mkdir(dir.c_str(), 0755);
	return dir + "/splitgba.ini";
}

static void loadSettings() {
	FILE* f = fopen(settingsPath().c_str(), "r");
	if (!f) {
		return;
	}
	char line[256];
	while (fgets(line, sizeof(line), f)) {
		char* eq = strchr(line, '=');
		if (!eq) {
			continue;
		}
		*eq = 0;
		std::string key = line;
		std::string val = eq + 1;
		while (!val.empty() && (val.back() == '\n' || val.back() == '\r')) {
			val.pop_back();
		}
		for (int i = 0; i < MAX_PLAYERS; ++i) {
			if (key == "name" + std::to_string(i + 1)) {
				g_app.playerName[i] = val.substr(0, 10);
			}
			if (key == "vol" + std::to_string(i + 1)) {
				g_app.playerVol[i].store(std::clamp(atoi(val.c_str()), 0, 150));
			}
		}
		if (key == "speed") {
			g_app.speedIdx.store(std::clamp(atoi(val.c_str()) - 1, 0, 3));
		} else if (key == "timer") {
			g_app.timerMode.store(std::clamp(atoi(val.c_str()), 0, 2));
		} else if (key == "countdown_min") {
			g_app.countdownMin.store(std::clamp(atoi(val.c_str()), 1, 120));
		} else if (key == "hud") {
			g_app.hudVisible = atoi(val.c_str()) != 0;
		} else if (key == "smooth") {
			g_app.smooth = atoi(val.c_str()) != 0;
		} else if (key == "mute") {
			g_app.masterMute.store(atoi(val.c_str()) != 0);
		}
	}
	fclose(f);
}

static void saveSettings() {
	FILE* f = fopen(settingsPath().c_str(), "w");
	if (!f) {
		return;
	}
	for (int i = 0; i < MAX_PLAYERS; ++i) {
		fprintf(f, "name%d=%s\n", i + 1, g_app.playerName[i].c_str());
		fprintf(f, "vol%d=%d\n", i + 1, g_app.playerVol[i].load());
	}
	fprintf(f, "speed=%d\n", g_app.speedIdx.load() + 1);
	fprintf(f, "timer=%d\n", g_app.timerMode.load());
	fprintf(f, "countdown_min=%d\n", g_app.countdownMin.load());
	fprintf(f, "hud=%d\n", g_app.hudVisible ? 1 : 0);
	fprintf(f, "smooth=%d\n", g_app.smooth ? 1 : 0);
	fprintf(f, "mute=%d\n", g_app.masterMute.load() ? 1 : 0);
	fclose(f);
}

// ---------------------------------------------------------------------------
// Einstellungsmenue

enum MenuId {
	MI_NAME0 = 0, MI_NAME1, MI_NAME2, MI_NAME3,
	MI_VOL0, MI_VOL1, MI_VOL2, MI_VOL3,
	MI_SPEED, MI_TIMERMODE, MI_COUNTDOWN,
	MI_MUTE, MI_HUD, MI_SMOOTH, MI_FULLSCREEN,
	MI_CLOSE, MI_QUIT,
};

static const int COUNTDOWN_STEPS[] = {1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120};

static std::vector<int> menuItems() {
	std::vector<int> items;
	for (int i = 0; i < g_app.numPlayers; ++i) {
		items.push_back(MI_NAME0 + i);
	}
	for (int i = 0; i < g_app.numPlayers; ++i) {
		items.push_back(MI_VOL0 + i);
	}
	items.push_back(MI_SPEED);
	items.push_back(MI_TIMERMODE);
	if (g_app.timerMode.load() == 2) {
		items.push_back(MI_COUNTDOWN);
	}
	items.push_back(MI_MUTE);
	items.push_back(MI_HUD);
	items.push_back(MI_SMOOTH);
	items.push_back(MI_FULLSCREEN);
	items.push_back(MI_CLOSE);
	items.push_back(MI_QUIT);
	return items;
}

static void applySmoothMode() {
	for (int i = 0; i < g_app.numPlayers; ++i) {
		if (g_players[i].tex) {
			SDL_SetTextureScaleMode(g_players[i].tex,
			                        g_app.smooth ? SDL_ScaleModeLinear : SDL_ScaleModeNearest);
		}
	}
}

static void toggleFullscreen() {
	g_app.fullscreen = !g_app.fullscreen;
	SDL_SetWindowFullscreen(g_app.window, g_app.fullscreen ? SDL_WINDOW_FULLSCREEN_DESKTOP : 0);
	SDL_ShowCursor(g_app.fullscreen ? SDL_DISABLE : SDL_ENABLE);
}

static void menuOpen() {
	g_app.menuOpen = true;
	g_app.menuSel = 0;
	g_app.keyboardKeys = 0;  // haengengebliebene Spieltasten loesen
	g_app.pausedBeforeMenu = g_app.paused;
	if (!g_app.paused) {
		togglePause();
	}
}

static void menuClose() {
	if (g_app.editingName) {
		g_app.editingName = false;
		SDL_StopTextInput();
	}
	g_app.menuOpen = false;
	saveSettings();
	if (!g_app.pausedBeforeMenu && g_app.paused) {
		togglePause();
	}
}

// Links/Rechts auf einem Menuepunkt
static void menuAdjust(int id, int dir, bool* quit) {
	(void)quit;
	if (id >= MI_VOL0 && id <= MI_VOL3) {
		int i = id - MI_VOL0;
		g_app.playerVol[i].store(std::clamp(g_app.playerVol[i].load() + dir * 10, 0, 150));
	} else if (id == MI_SPEED) {
		g_app.speedIdx.store(std::clamp(g_app.speedIdx.load() + dir, 0, 3));
		applySpeed();
	} else if (id == MI_TIMERMODE) {
		g_app.timerMode.store((g_app.timerMode.load() + dir + 3) % 3);
	} else if (id == MI_COUNTDOWN) {
		int cur = g_app.countdownMin.load();
		int n = (int)(sizeof(COUNTDOWN_STEPS) / sizeof(int));
		int idx = 0;
		for (int i = 0; i < n; ++i) {
			if (COUNTDOWN_STEPS[i] <= cur) {
				idx = i;
			}
		}
		idx = std::clamp(idx + dir, 0, n - 1);
		g_app.countdownMin.store(COUNTDOWN_STEPS[idx]);
	} else if (id == MI_MUTE) {
		g_app.masterMute.store(!g_app.masterMute.load());
	} else if (id == MI_HUD) {
		g_app.hudVisible = !g_app.hudVisible;
	} else if (id == MI_SMOOTH) {
		g_app.smooth = !g_app.smooth;
		applySmoothMode();
	} else if (id == MI_FULLSCREEN) {
		toggleFullscreen();
	}
}

// Enter/A auf einem Menuepunkt
static void menuActivate(int id, bool* quit) {
	if (id >= MI_NAME0 && id <= MI_NAME3) {
		g_app.editingName = true;
		g_app.editingIndex = id - MI_NAME0;
		g_app.editBuffer = g_app.playerName[g_app.editingIndex];
		SDL_StartTextInput();
	} else if (id == MI_CLOSE) {
		menuClose();
	} else if (id == MI_QUIT) {
		*quit = true;
	} else {
		menuAdjust(id, +1, quit);
	}
}

static void menuNav(int dir) {
	std::vector<int> items = menuItems();
	g_app.menuSel = ((g_app.menuSel + dir) % (int)items.size() + (int)items.size()) %
	                (int)items.size();
}

static void menuHandleKey(const SDL_KeyboardEvent& ev, bool* quit) {
	SDL_Keycode key = ev.keysym.sym;

	if (g_app.editingName) {
		if (key == SDLK_RETURN || key == SDLK_KP_ENTER) {
			g_app.playerName[g_app.editingIndex] = g_app.editBuffer;
			g_app.editingName = false;
			SDL_StopTextInput();
		} else if (key == SDLK_ESCAPE) {
			g_app.editingName = false;
			SDL_StopTextInput();
		} else if (key == SDLK_BACKSPACE && !g_app.editBuffer.empty()) {
			g_app.editBuffer.pop_back();
		}
		return;
	}

	std::vector<int> items = menuItems();
	if (g_app.menuSel >= (int)items.size()) {
		g_app.menuSel = 0;
	}
	int id = items[g_app.menuSel];

	switch (key) {
	case SDLK_ESCAPE:
		menuClose();
		break;
	case SDLK_UP:
		menuNav(-1);
		break;
	case SDLK_DOWN:
		menuNav(+1);
		break;
	case SDLK_LEFT:
		menuAdjust(id, -1, quit);
		break;
	case SDLK_RIGHT:
		menuAdjust(id, +1, quit);
		break;
	case SDLK_RETURN:
	case SDLK_KP_ENTER:
		menuActivate(id, quit);
		break;
	default:
		break;
	}
}

static void menuHandlePad(const SDL_ControllerButtonEvent& ev, bool* quit) {
	if (g_app.editingName) {
		return;  // Namen nur per Tastatur
	}
	std::vector<int> items = menuItems();
	if (g_app.menuSel >= (int)items.size()) {
		g_app.menuSel = 0;
	}
	int id = items[g_app.menuSel];
	switch (ev.button) {
	case SDL_CONTROLLER_BUTTON_DPAD_UP: menuNav(-1); break;
	case SDL_CONTROLLER_BUTTON_DPAD_DOWN: menuNav(+1); break;
	case SDL_CONTROLLER_BUTTON_DPAD_LEFT: menuAdjust(id, -1, quit); break;
	case SDL_CONTROLLER_BUTTON_DPAD_RIGHT: menuAdjust(id, +1, quit); break;
	case SDL_CONTROLLER_BUTTON_A: menuActivate(id, quit); break;
	case SDL_CONTROLLER_BUTTON_B:
	case SDL_CONTROLLER_BUTTON_START: menuClose(); break;
	default: break;
	}
}

static void menuHandleText(const SDL_TextInputEvent& ev) {
	if (!g_app.editingName) {
		return;
	}
	for (const char* c = ev.text; *c; ++c) {
		char ch = *c;
		if (ch >= 'a' && ch <= 'z') {
			ch = (char)(ch - 'a' + 'A');
		}
		bool ok = (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == ' ' ||
		          ch == '-' || ch == '_';
		if (ok && g_app.editBuffer.size() < 10) {
			g_app.editBuffer.push_back(ch);
		}
	}
}

// ---------------------------------------------------------------------------
// Text-Rendering (Font-Atlas aus font5x7.h)

static SDL_Texture* buildFontTexture(SDL_Renderer* renderer) {
	int count = (int)(sizeof(splitfont::GLYPHS) / sizeof(splitfont::GLYPHS[0]));
	SDL_Surface* surf = SDL_CreateRGBSurfaceWithFormat(
	    0, count * splitfont::GLYPH_W, splitfont::GLYPH_H, 32, SDL_PIXELFORMAT_ABGR8888);
	if (!surf) {
		return nullptr;
	}
	SDL_FillRect(surf, nullptr, 0);
	uint32_t* px = static_cast<uint32_t*>(surf->pixels);
	int pitch = surf->pitch / 4;
	for (int g = 0; g < count; ++g) {
		for (int row = 0; row < splitfont::GLYPH_H; ++row) {
			uint8_t bits = splitfont::GLYPHS[g].rows[row];
			for (int col = 0; col < splitfont::GLYPH_W; ++col) {
				if (bits & (0x10 >> col)) {
					px[row * pitch + g * splitfont::GLYPH_W + col] = 0xFFFFFFFF;
				}
			}
		}
	}
	SDL_Texture* tex = SDL_CreateTextureFromSurface(renderer, surf);
	SDL_FreeSurface(surf);
	SDL_SetTextureBlendMode(tex, SDL_BLENDMODE_BLEND);
	return tex;
}

static int glyphIndex(char c) {
	if (c >= 'a' && c <= 'z') {
		c = (char)(c - 'a' + 'A');
	}
	int count = (int)(sizeof(splitfont::GLYPHS) / sizeof(splitfont::GLYPHS[0]));
	for (int i = 0; i < count; ++i) {
		if (splitfont::GLYPHS[i].c == c) {
			return i;
		}
	}
	return -1;
}

static int textWidth(const std::string& s, int scale) {
	return (int)s.size() * splitfont::ADVANCE * scale;
}

static void drawText(const std::string& s, int x, int y, int scale,
                     uint8_t r, uint8_t g, uint8_t b, uint8_t a = 255) {
	SDL_SetTextureColorMod(g_app.fontTex, r, g, b);
	SDL_SetTextureAlphaMod(g_app.fontTex, a);
	int cx = x;
	for (char c : s) {
		int idx = glyphIndex(c);
		if (idx >= 0) {
			SDL_Rect src = {idx * splitfont::GLYPH_W, 0, splitfont::GLYPH_W, splitfont::GLYPH_H};
			SDL_Rect dst = {cx, y, splitfont::GLYPH_W * scale, splitfont::GLYPH_H * scale};
			SDL_RenderCopy(g_app.renderer, g_app.fontTex, &src, &dst);
		}
		cx += splitfont::ADVANCE * scale;
	}
}

// ---------------------------------------------------------------------------
// Layout & Rendering

struct Layout {
	SDL_Rect cells[MAX_PLAYERS];
	bool hasHudCell = false;
	SDL_Rect hudCell;
};

static Layout computeLayout(int w, int h, int n) {
	Layout lay = {};
	if (n <= 1) {
		lay.cells[0] = {0, 0, w, h};
	} else if (n == 2) {
		lay.cells[0] = {0, 0, w / 2, h};
		lay.cells[1] = {w / 2, 0, w - w / 2, h};
	} else {
		int cw = w / 2;
		int ch = h / 2;
		lay.cells[0] = {0, 0, cw, ch};
		lay.cells[1] = {cw, 0, w - cw, ch};
		lay.cells[2] = {0, ch, cw, h - ch};
		lay.cells[3] = {cw, ch, w - cw, h - ch};
		if (n == 3) {
			lay.hasHudCell = true;
			lay.hudCell = lay.cells[3];
		}
	}
	return lay;
}

static SDL_Rect fitGBA(const SDL_Rect& cell) {
	double sx = (double)cell.w / GBA_SCREEN_W;
	double sy = (double)cell.h / GBA_SCREEN_H;
	double scale = std::min(sx, sy);
	if (scale > 1.0 && !g_app.smooth) {
		scale = std::floor(scale);  // ganzzahlig = scharfe Pixel
	}
	int dw = (int)(GBA_SCREEN_W * scale);
	int dh = (int)(GBA_SCREEN_H * scale);
	return {cell.x + (cell.w - dw) / 2, cell.y + (cell.h - dh) / 2, dw, dh};
}

static void fillRect(int x, int y, int w, int h, uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
	SDL_SetRenderDrawBlendMode(g_app.renderer, SDL_BLENDMODE_BLEND);
	SDL_SetRenderDrawColor(g_app.renderer, r, g, b, a);
	SDL_Rect rect = {x, y, w, h};
	SDL_RenderFillRect(g_app.renderer, &rect);
}

static void hudAppend(std::string& line, const std::string& part) {
	if (!line.empty()) {
		line += "  ";
	}
	line += part;
}

static std::string hudLine() {
	std::string line;
	if (g_app.timerMode.load() != 0) {
		hudAppend(line, formatTimer(displayTimerMs()));
		if (countdownExpired()) {
			hudAppend(line, "ZEIT!");
		}
	}
	char speed[16];
	snprintf(speed, sizeof(speed), "%gX", currentSpeed());
	hudAppend(line, speed);
	if (g_app.linked) {
		hudAppend(line, "LINK");
	}
	if (g_app.masterMute.load()) {
		hudAppend(line, "STUMM");
	}
	if (g_app.paused && !g_app.menuOpen) {
		hudAppend(line, "PAUSE");
	}
	return line;
}

// Ein Menuepunkt: Beschriftung + aktueller Wert
static void menuItemText(int id, std::string& label, std::string& value) {
	if (id >= MI_NAME0 && id <= MI_NAME3) {
		int i = id - MI_NAME0;
		label = "NAME SPIELER " + std::to_string(i + 1);
		if (g_app.editingName && g_app.editingIndex == i) {
			value = g_app.editBuffer + ((SDL_GetTicks64() / 400) % 2 ? "_" : " ");
		} else {
			value = g_app.playerName[i].empty() ? "---" : g_app.playerName[i];
		}
	} else if (id >= MI_VOL0 && id <= MI_VOL3) {
		int i = id - MI_VOL0;
		label = "LAUTSTAERKE P" + std::to_string(i + 1);
		value = std::to_string(g_app.playerVol[i].load()) + " PROZENT";
	} else if (id == MI_SPEED) {
		label = "TEMPO";
		value = std::to_string(g_app.speedIdx.load() + 1) + "X";
	} else if (id == MI_TIMERMODE) {
		label = "TIMER";
		int m = g_app.timerMode.load();
		value = m == 0 ? "AUS" : (m == 1 ? "STOPPUHR" : "COUNTDOWN");
	} else if (id == MI_COUNTDOWN) {
		label = "COUNTDOWN-DAUER";
		value = std::to_string(g_app.countdownMin.load()) + " MIN";
	} else if (id == MI_MUTE) {
		label = "TON";
		value = g_app.masterMute.load() ? "STUMM" : "AN";
	} else if (id == MI_HUD) {
		label = "ANZEIGEN (HUD)";
		value = g_app.hudVisible ? "AN" : "AUS";
	} else if (id == MI_SMOOTH) {
		label = "GLAETTUNG";
		value = g_app.smooth ? "AN" : "AUS";
	} else if (id == MI_FULLSCREEN) {
		label = "VOLLBILD";
		value = g_app.fullscreen ? "AN" : "AUS";
	} else if (id == MI_CLOSE) {
		label = "SCHLIESSEN";
		value = "";
	} else if (id == MI_QUIT) {
		label = "SPLITGBA BEENDEN";
		value = "";
	}
}

static void drawMenu(int outW, int outH) {
	std::vector<int> items = menuItems();
	if (g_app.menuSel >= (int)items.size()) {
		g_app.menuSel = (int)items.size() - 1;
	}

	int scale = std::max(2, outH / 450);
	int rowH = (splitfont::GLYPH_H + 4) * scale;
	int labelCol = 18 * splitfont::ADVANCE * scale;
	int valueCol = 14 * splitfont::ADVANCE * scale;
	int panelW = labelCol + valueCol + 40 * scale;
	int panelH = ((int)items.size() + 4) * rowH;
	int px = (outW - panelW) / 2;
	int py = (outH - panelH) / 2;

	fillRect(px, py, panelW, panelH, 10, 10, 14, 235);
	SDL_SetRenderDrawBlendMode(g_app.renderer, SDL_BLENDMODE_NONE);
	SDL_SetRenderDrawColor(g_app.renderer, 90, 90, 110, 255);
	SDL_Rect frame = {px, py, panelW, panelH};
	SDL_RenderDrawRect(g_app.renderer, &frame);

	std::string title = "EINSTELLUNGEN";
	drawText(title, px + (panelW - textWidth(title, scale)) / 2, py + rowH / 2, scale,
	         120, 200, 255);

	int y = py + rowH * 2;
	for (int n = 0; n < (int)items.size(); ++n) {
		std::string label, value;
		menuItemText(items[n], label, value);
		bool sel = n == g_app.menuSel;
		uint8_t r = sel ? 255 : 200;
		uint8_t g = sel ? 220 : 200;
		uint8_t b = sel ? 120 : 205;
		if (sel) {
			fillRect(px + 8 * scale, y - 2 * scale, panelW - 16 * scale, rowH, 60, 60, 80, 160);
			drawText(">", px + 10 * scale, y, scale, 255, 220, 120);
		}
		drawText(label, px + 20 * scale, y, scale, r, g, b);
		drawText(value, px + 20 * scale + labelCol, y, scale, r, g, b);
		y += rowH;
	}

	std::string hint = g_app.editingName
	    ? "TIPPEN: NAME  ENTER: OK  ESC: ABBRECHEN"
	    : "PFEILE: WAEHLEN/AENDERN  ENTER: OK  ESC: SCHLIESSEN";
	int hs = std::max(1, scale - 1);
	drawText(hint, px + (panelW - textWidth(hint, hs)) / 2, py + panelH - rowH + 2 * scale,
	         hs, 150, 150, 160);
}

static void renderFrame(int outW, int outH) {
	// Countdown bei 0 automatisch anhalten
	if (g_app.timerMode.load() == 2 && g_app.timerRunning.load() && countdownExpired()) {
		timerToggle();
		g_app.timerAccumMs = (uint64_t)g_app.countdownMin.load() * 60000;
	}

	SDL_SetRenderDrawBlendMode(g_app.renderer, SDL_BLENDMODE_NONE);
	SDL_SetRenderDrawColor(g_app.renderer, 16, 16, 20, 255);
	SDL_RenderClear(g_app.renderer);

	Layout lay = computeLayout(outW, outH, g_app.numPlayers);
	int labelScale = std::max(1, outH / 500);

	for (int i = 0; i < g_app.numPlayers; ++i) {
		Player& p = g_players[i];
		if (p.frameDirty.exchange(false)) {
			std::lock_guard<std::mutex> guard(p.frameMutex);
			SDL_UpdateTexture(p.tex, nullptr, p.frontBuffer, GBA_SCREEN_W * sizeof(uint32_t));
		}
		SDL_Rect dst = fitGBA(lay.cells[i]);
		SDL_RenderCopy(g_app.renderer, p.tex, nullptr, &dst);

		if (g_app.hudVisible) {
			std::string label = "P" + std::to_string(i + 1);
			if (!g_app.playerName[i].empty()) {
				label += " " + g_app.playerName[i];
			}
			label += " - " + p.label;
			label += p.pad ? " (PAD)" : (i == 0 ? " (TASTATUR)" : " (KEIN PAD)");
			if (mCoreThreadHasCrashed(&p.thread)) {
				label += " !ABSTURZ!";
			}
			int tw = textWidth(label, labelScale);
			int tx = lay.cells[i].x + 10;
			int ty = lay.cells[i].y + lay.cells[i].h - splitfont::GLYPH_H * labelScale - 8;
			fillRect(tx - 4, ty - 4, tw + 8, splitfont::GLYPH_H * labelScale + 8, 0, 0, 0, 160);
			drawText(label, tx, ty, labelScale, 255, 255, 255);
		}
	}

	if (!g_app.hudVisible) {
		return;
	}

	std::string hud = hudLine();
	if (lay.hasHudCell && g_app.timerMode.load() != 0) {
		// 3 Spieler: die freie Kachel wird zur grossen Anzeige
		int timerScale = std::max(2, lay.hudCell.w / (8 * splitfont::ADVANCE));
		std::string timer = formatTimer(displayTimerMs());
		bool alarm = g_app.timerMode.load() == 2 && displayTimerMs() < 60000;
		int tw = textWidth(timer, timerScale);
		int tx = lay.hudCell.x + (lay.hudCell.w - tw) / 2;
		int ty = lay.hudCell.y + lay.hudCell.h / 2 - splitfont::GLYPH_H * timerScale;
		drawText(timer, tx, ty, timerScale, 240, alarm ? 90 : 240, alarm ? 90 : 240);
		int subScale = std::max(1, timerScale / 3);
		std::string sub = hud.size() > timer.size() ? hud.substr(timer.size()) : "";
		int sw = textWidth(sub, subScale);
		drawText(sub, lay.hudCell.x + (lay.hudCell.w - sw) / 2,
		         ty + splitfont::GLYPH_H * timerScale + 12 * subScale, subScale, 180, 180, 190);
	} else {
		int hudScale = std::max(2, outH / 400);
		int tw = textWidth(hud, hudScale);
		int tx = (outW - tw) / 2;
		int ty = 8;
		fillRect(tx - 8, ty - 5, tw + 16, splitfont::GLYPH_H * hudScale + 10, 0, 0, 0, 170);
		drawText(hud, tx, ty, hudScale, 250, 250, 250);
	}

	if (g_app.paused && !g_app.menuOpen) {
		int ps = std::max(3, outH / 160);
		std::string msg = "PAUSE";
		int tw = textWidth(msg, ps);
		fillRect((outW - tw) / 2 - 12, outH / 2 - ps * 6, tw + 24, splitfont::GLYPH_H * ps + ps * 4, 0, 0, 0, 190);
		drawText(msg, (outW - tw) / 2, outH / 2 - ps * 4, ps, 255, 220, 120);
	}

	if (g_app.menuOpen) {
		drawMenu(outW, outH);
	}
}

// ---------------------------------------------------------------------------
// Argumente

struct Args {
	std::vector<std::string> roms;
	bool fullscreen = false;
	bool smooth = false;
	bool noLink = false;
	bool mute = false;
	int copies = 1;
	int speed = 0;  // 0 = nicht per CLI gesetzt (dann gilt die gespeicherte Einstellung)
	bool listPads = false;
	bool showMenu = false;  // Debug: Menue im Screenshot-Modus rendern
	int exitAfterSec = 0;  // Debug: nach N Sekunden automatisch beenden
	std::string screenshotPath;
	int screenshotFrames = 240;
	bool showHelp = false;
};

static void usage(const char* argv0) {
	printf("SplitGBA — 4-Spieler-Splitscreen-GBA-Emulator mit Link-Kabel\n\n");
	printf("Aufruf: %s [Optionen] ROM1 [ROM2 ROM3 ROM4]\n", argv0);
	printf("        %s [Optionen] <Ordner-mit-ROMs>\n", argv0);
	printf("        %s -n 4 <ROM>            (4x dasselbe Spiel, z.B. fuer Races)\n\n", argv0);
	printf("Optionen:\n");
	printf("  -f, --fullscreen   Vollbild starten (fuer den TV)\n");
	printf("      --smooth       weiche Skalierung statt scharfer Pixel\n");
	printf("      --no-link      Link-Kabel deaktivieren\n");
	printf("      --mute         ohne Ton starten\n");
	printf("  -n <1-4>           ROM mehrfach starten (eigener Spielstand pro Spieler)\n");
	printf("      --speed <1-4>  Start-Tempo (Standard 1)\n");
	printf("      --list-pads    erkannte Controller anzeigen und beenden\n");
	printf("      --screenshot <datei.bmp> [--frames N]   Debug: rendern und beenden\n");
	printf("  -h, --help         diese Hilfe\n\n");
	printf("Tasten: Esc Menue (Namen, Timer, Lautstaerke, Beenden), 1-4/F1-F4 Tempo,\n");
	printf("        Tab Turbo, Leertaste Timer, R Timer-Reset, Shift+R alle neu starten,\n");
	printf("        P Pause, M stumm, F5/F9 Savestate speichern/laden, F Vollbild, H HUD\n");
	printf("Spieler 1 Tastatur: Pfeile, X=A, Z/Y=B, A=L, S=R, Enter=Start, Backspace=Select\n");
}

static bool collectRomsFromDir(const std::string& dir, std::vector<std::string>& roms) {
	DIR* d = opendir(dir.c_str());
	if (!d) {
		return false;
	}
	std::vector<std::string> found;
	while (struct dirent* e = readdir(d)) {
		std::string name = e->d_name;
		if (name.size() > 4 && name.substr(name.size() - 4) == ".gba") {
			found.push_back(dir + "/" + name);
		}
	}
	closedir(d);
	std::sort(found.begin(), found.end());
	for (const auto& f : found) {
		if ((int)roms.size() < MAX_PLAYERS) {
			roms.push_back(f);
		}
	}
	return !found.empty();
}

static bool parseArgs(int argc, char** argv, Args& args) {
	for (int i = 1; i < argc; ++i) {
		std::string a = argv[i];
		if (a == "-f" || a == "--fullscreen") {
			args.fullscreen = true;
		} else if (a == "--smooth") {
			args.smooth = true;
		} else if (a == "--no-link") {
			args.noLink = true;
		} else if (a == "--mute") {
			args.mute = true;
		} else if (a == "-n" && i + 1 < argc) {
			args.copies = std::clamp(atoi(argv[++i]), 1, MAX_PLAYERS);
		} else if (a == "--list-pads") {
			args.listPads = true;
		} else if (a == "--show-menu") {
			args.showMenu = true;
		} else if (a == "--speed" && i + 1 < argc) {
			args.speed = std::clamp(atoi(argv[++i]), 1, 4);
		} else if (a == "--exit-after" && i + 1 < argc) {
			args.exitAfterSec = std::max(0, atoi(argv[++i]));
		} else if (a == "--screenshot" && i + 1 < argc) {
			args.screenshotPath = argv[++i];
		} else if (a == "--frames" && i + 1 < argc) {
			args.screenshotFrames = std::max(1, atoi(argv[++i]));
		} else if (a == "-h" || a == "--help") {
			args.showHelp = true;
		} else if (!a.empty() && a[0] == '-') {
			fprintf(stderr, "Unbekannte Option: %s\n", a.c_str());
			return false;
		} else {
			struct stat st = {};
			if (stat(a.c_str(), &st) == 0 && S_ISDIR(st.st_mode)) {
				collectRomsFromDir(a, args.roms);
			} else if ((int)args.roms.size() < MAX_PLAYERS) {
				args.roms.push_back(a);
			}
		}
	}
	if (args.copies > 1 && args.roms.size() == 1) {
		std::string rom = args.roms[0];
		for (int i = 1; i < args.copies; ++i) {
			args.roms.push_back(rom);
		}
	}
	return true;
}

// ---------------------------------------------------------------------------

static void handleKeyDown(const SDL_KeyboardEvent& ev, bool& quit) {
	SDL_Keycode key = ev.keysym.sym;
	bool shift = (ev.keysym.mod & KMOD_SHIFT) != 0;

	switch (key) {
	case SDLK_ESCAPE:
		menuOpen();
		return;
	case SDLK_1: case SDLK_F1: g_app.speedIdx.store(0); applySpeed(); return;
	case SDLK_2: case SDLK_F2: g_app.speedIdx.store(1); applySpeed(); return;
	case SDLK_3: case SDLK_F3: g_app.speedIdx.store(2); applySpeed(); return;
	case SDLK_4: case SDLK_F4: g_app.speedIdx.store(3); applySpeed(); return;
	case SDLK_TAB:
		if (!ev.repeat) {
			g_app.turbo.store(true);
			applySpeed();
		}
		return;
	case SDLK_SPACE:
		if (!ev.repeat && g_app.timerMode.load() != 0) {
			timerToggle();
		}
		return;
	case SDLK_r:
		if (ev.repeat) {
			return;
		}
		if (shift) {
			bool wasRunning = g_app.timerRunning.load();
			if (wasRunning) {
				timerToggle();
			}
			timerReset();
			for (int i = 0; i < g_app.numPlayers; ++i) {
				mCoreThreadReset(&g_players[i].thread);
			}
			printf("Alle Spiele neu gestartet, Timer auf 0\n");
		} else {
			timerReset();
		}
		return;
	case SDLK_p:
		if (!ev.repeat) {
			togglePause();
		}
		return;
	case SDLK_m:
		if (!ev.repeat) {
			g_app.masterMute.store(!g_app.masterMute.load());
		}
		return;
	case SDLK_f:
		if (!ev.repeat) {
			toggleFullscreen();
		}
		return;
	case SDLK_h:
		if (!ev.repeat) {
			g_app.hudVisible = !g_app.hudVisible;
		}
		return;
	case SDLK_F5:
		if (!ev.repeat) {
			saveAllStates();
		}
		return;
	case SDLK_F9:
		if (!ev.repeat) {
			loadAllStates();
		}
		return;
	default:
		break;
	}

	for (const auto& m : KEYBOARD_MAP) {
		if (ev.keysym.scancode == m.sc) {
			g_app.keyboardKeys |= m.bit;
		}
	}
}

static void handleKeyUp(const SDL_KeyboardEvent& ev) {
	if (ev.keysym.sym == SDLK_TAB) {
		g_app.turbo.store(false);
		applySpeed();
		return;
	}
	for (const auto& m : KEYBOARD_MAP) {
		if (ev.keysym.scancode == m.sc) {
			g_app.keyboardKeys &= (uint16_t)~m.bit;
		}
	}
}

static int listPads() {
	if (SDL_Init(SDL_INIT_GAMECONTROLLER) < 0) {
		fprintf(stderr, "SDL-Init fehlgeschlagen: %s\n", SDL_GetError());
		return 1;
	}
	SDL_GameControllerAddMappingsFromFile("gamecontrollerdb.txt");
	int n = SDL_NumJoysticks();
	printf("%d Controller gefunden:\n", n);
	for (int i = 0; i < n; ++i) {
		if (SDL_IsGameController(i)) {
			SDL_GameController* gc = SDL_GameControllerOpen(i);
			printf("  Spieler %d: %s — OK\n", i + 1,
			       gc ? SDL_GameControllerName(gc) : SDL_JoystickNameForIndex(i));
			if (gc) {
				SDL_GameControllerClose(gc);
			}
		} else {
			printf("  [%d] %s — kein Mapping! (gamecontrollerdb.txt ins "
			       "Startverzeichnis legen)\n",
			       i + 1, SDL_JoystickNameForIndex(i));
		}
	}
	if (n == 0) {
		printf("  (Controller per USB anschliessen oder via Bluetooth koppeln,\n"
		       "   dann erneut ausfuehren)\n");
	}
	SDL_Quit();
	return 0;
}

int main(int argc, char** argv) {
	Args args;
	if (!parseArgs(argc, argv, args)) {
		usage(argv[0]);
		return 1;
	}
	if (args.listPads) {
		return listPads();
	}
	if (args.showHelp || args.roms.empty()) {
		usage(argv[0]);
		return args.showHelp ? 0 : 1;
	}

	s_logger.log = quietLog;
	mLogSetDefaultLogger(&s_logger);

	loadSettings();
	g_app.linkEnabled = !args.noLink;
	if (args.smooth) {
		g_app.smooth = true;
	}
	if (args.mute) {
		g_app.masterMute.store(true);
	}
	if (args.speed) {
		g_app.speedIdx.store(args.speed - 1);
	}
	g_app.fullscreen = args.fullscreen;
	g_app.freeRun = !args.screenshotPath.empty();
	bool screenshotMode = g_app.freeRun;

	if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMECONTROLLER | SDL_INIT_AUDIO) < 0) {
		fprintf(stderr, "SDL-Init fehlgeschlagen: %s\n", SDL_GetError());
		return 1;
	}
	SDL_SetHint(SDL_HINT_RENDER_SCALE_QUALITY, g_app.smooth ? "1" : "0");
	// Controller weiterbedienen, auch wenn das Fenster kurz den Fokus verliert
	SDL_SetHint(SDL_HINT_JOYSTICK_ALLOW_BACKGROUND_EVENTS, "1");

	// Community-Mappings laden, falls vorhanden (mehr Controller-Modelle)
	SDL_GameControllerAddMappingsFromFile("gamecontrollerdb.txt");

	uint32_t winFlags = SDL_WINDOW_RESIZABLE | SDL_WINDOW_ALLOW_HIGHDPI;
	if (screenshotMode) {
		winFlags |= SDL_WINDOW_HIDDEN;
	} else if (args.fullscreen) {
		winFlags |= SDL_WINDOW_FULLSCREEN_DESKTOP;
	}
	g_app.window = SDL_CreateWindow("SplitGBA", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
	                                1600, 900, winFlags);
	if (!g_app.window) {
		fprintf(stderr, "Fenster konnte nicht erstellt werden: %s\n", SDL_GetError());
		return 1;
	}
	g_app.renderer = SDL_CreateRenderer(
	    g_app.window, -1,
	    screenshotMode ? SDL_RENDERER_SOFTWARE : (SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC));
	if (!g_app.renderer) {
		g_app.renderer = SDL_CreateRenderer(g_app.window, -1, 0);
	}
	if (!g_app.renderer) {
		fprintf(stderr, "Renderer konnte nicht erstellt werden: %s\n", SDL_GetError());
		return 1;
	}
	if (args.fullscreen && !screenshotMode) {
		SDL_ShowCursor(SDL_DISABLE);
	}
	g_app.fontTex = buildFontTexture(g_app.renderer);

	// Audio oeffnen, bevor die Cores starten (der Callback gibt den Takt vor)
	if (!screenshotMode) {
		SDL_AudioSpec want = {};
		want.freq = 48000;
		want.format = AUDIO_S16SYS;
		want.channels = 2;
		want.samples = 512;
		want.callback = audioCallback;
		g_app.audioDev = SDL_OpenAudioDevice(nullptr, 0, &want, &g_app.audioSpec,
		                                     SDL_AUDIO_ALLOW_FREQUENCY_CHANGE);
		if (g_app.audioDev) {
			g_app.audioOk = true;
		} else {
			fprintf(stderr, "Kein Audiogeraet (%s) — Takt laeuft ueber Software-Drossel\n",
			        SDL_GetError());
		}
	}

	// Doppelte ROM-Pfade erkennen: jeder Spieler bekommt eigenen Spielstand
	g_app.numPlayers = (int)args.roms.size();
	for (int i = 0; i < g_app.numPlayers; ++i) {
		bool dup = false;
		for (int j = 0; j < g_app.numPlayers; ++j) {
			if (j != i && args.roms[j] == args.roms[i]) {
				dup = true;
			}
		}
		if (!bootPlayer(g_players[i], i, args.roms[i], dup)) {
			g_app.numPlayers = i;  // nur gestartete Spieler wieder abbauen
			shutdownPlayers();
			SDL_Quit();
			return 1;
		}
		if (dup) {
			printf("Hinweis: '%s' mehrfach geladen — Spielstand P%d liegt in %s\n",
			       baseName(args.roms[i]).c_str(), i + 1,
			       savePathFor(g_players[i], i, true).c_str());
		}
	}

	for (int i = 0; i < g_app.numPlayers; ++i) {
		g_players[i].tex = SDL_CreateTexture(g_app.renderer, SDL_PIXELFORMAT_ABGR8888,
		                                     SDL_TEXTUREACCESS_STREAMING, GBA_SCREEN_W, GBA_SCREEN_H);
	}
	applySmoothMode();

	applySpeed();
	attachLink();

	if (g_app.audioDev) {
		SDL_PauseAudioDevice(g_app.audioDev, 0);
	}

	printf("SplitGBA laeuft: %d Spieler%s, Tempo %gx\n", g_app.numPlayers,
	       g_app.linked ? ", Link-Kabel aktiv" : "", currentSpeed());

	if (screenshotMode) {
		g_app.timerStartTick = SDL_GetTicks64();
		g_app.timerRunning.store(true);
		uint64_t deadline = SDL_GetTicks64() + 15000;
		bool done = false;
		while (!done && SDL_GetTicks64() < deadline) {
			done = true;
			for (int i = 0; i < g_app.numPlayers; ++i) {
				if (g_players[i].frameCount.load() < (uint64_t)args.screenshotFrames) {
					done = false;
				}
			}
			SDL_Delay(10);
		}
		if (!done) {
			for (int i = 0; i < g_app.numPlayers; ++i) {
				fprintf(stderr, "Spieler %d: %llu Frames\n", i + 1,
				        (unsigned long long)g_players[i].frameCount.load());
			}
			fprintf(stderr, "Zeitlimit erreicht — moeglicher Deadlock!\n");
			shutdownPlayers();
			SDL_Quit();
			return 1;
		}
		interruptAll();
		if (args.showMenu) {
			g_app.menuOpen = true;  // nur fuers Bild, ohne Pause-Logik
		}
		int outW, outH;
		SDL_GetRendererOutputSize(g_app.renderer, &outW, &outH);
		renderFrame(outW, outH);
		SDL_Surface* shot = SDL_CreateRGBSurfaceWithFormat(0, outW, outH, 24,
		                                                   SDL_PIXELFORMAT_RGB24);
		SDL_RenderReadPixels(g_app.renderer, nullptr, SDL_PIXELFORMAT_RGB24,
		                     shot->pixels, shot->pitch);
		if (SDL_SaveBMP(shot, args.screenshotPath.c_str()) != 0) {
			fprintf(stderr, "Screenshot fehlgeschlagen: %s\n", SDL_GetError());
		}
		SDL_FreeSurface(shot);
		printf("Screenshot nach %d Frames: %s\n", args.screenshotFrames,
		       args.screenshotPath.c_str());
		continueAll();
		shutdownPlayers();
		SDL_Quit();
		return 0;
	}

	bool quit = false;
	uint64_t exitDeadline =
	    args.exitAfterSec ? SDL_GetTicks64() + (uint64_t)args.exitAfterSec * 1000 : 0;
	while (!quit) {
		if (exitDeadline && SDL_GetTicks64() >= exitDeadline) {
			quit = true;
		}
		SDL_Event ev;
		while (SDL_PollEvent(&ev)) {
			switch (ev.type) {
			case SDL_QUIT:
				quit = true;
				break;
			case SDL_KEYDOWN:
				if (g_app.menuOpen) {
					menuHandleKey(ev.key, &quit);
				} else {
					handleKeyDown(ev.key, quit);
				}
				break;
			case SDL_KEYUP:
				if (!g_app.menuOpen) {
					handleKeyUp(ev.key);
				}
				break;
			case SDL_TEXTINPUT:
				menuHandleText(ev.text);
				break;
			case SDL_CONTROLLERBUTTONDOWN:
				if (g_app.menuOpen) {
					menuHandlePad(ev.cbutton, &quit);
				}
				break;
			case SDL_CONTROLLERDEVICEADDED:
				assignController(ev.cdevice.which);
				break;
			case SDL_CONTROLLERDEVICEREMOVED:
				removeController(ev.cdevice.which);
				break;
			default:
				break;
			}
		}

		if (!g_app.paused) {
			pushInput();
		}

		int outW, outH;
		SDL_GetRendererOutputSize(g_app.renderer, &outW, &outH);
		renderFrame(outW, outH);
		SDL_RenderPresent(g_app.renderer);
	}

	saveSettings();
	for (int i = 0; i < g_app.numPlayers; ++i) {
		printf("Spieler %d: %llu Frames emuliert\n", i + 1,
		       (unsigned long long)g_players[i].frameCount.load());
	}
	shutdownPlayers();
	if (g_app.fontTex) {
		SDL_DestroyTexture(g_app.fontTex);
	}
	SDL_DestroyRenderer(g_app.renderer);
	SDL_DestroyWindow(g_app.window);
	SDL_Quit();
	return 0;
}
