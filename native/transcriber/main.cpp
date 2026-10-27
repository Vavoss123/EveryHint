#include "whisper.h"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <memory>
#include <string>
#include <vector>
#include <ctime>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#include <windows.h>
#include <psapi.h>
#endif

using Clock = std::chrono::steady_clock;
static double elapsed(Clock::time_point start) { return std::chrono::duration<double, std::milli>(Clock::now() - start).count(); }
static double cpuMs() {
#ifdef _WIN32
  FILETIME created, exited, kernel, user;
  if (!GetProcessTimes(GetCurrentProcess(), &created, &exited, &kernel, &user)) return 0;
  ULARGE_INTEGER k, u; k.LowPart = kernel.dwLowDateTime; k.HighPart = kernel.dwHighDateTime; u.LowPart = user.dwLowDateTime; u.HighPart = user.dwHighDateTime;
  return static_cast<double>(k.QuadPart + u.QuadPart) / 10000.0;
#else
  return static_cast<double>(std::clock()) * 1000 / CLOCKS_PER_SEC;
#endif
}
static std::uint64_t memoryBytes() {
#ifdef _WIN32
  PROCESS_MEMORY_COUNTERS counters{};
  if (GetProcessMemoryInfo(GetCurrentProcess(), &counters, sizeof(counters))) return counters.WorkingSetSize;
#endif
  return 0;
}
static std::string json(const std::string &text) {
  std::string result = "\"";
  for (unsigned char c : text) {
    if (c == '"' || c == '\\') { result += '\\'; result += c; }
    else if (c < 32) { const char *hex = "0123456789abcdef"; result += "\\u00"; result += hex[c >> 4]; result += hex[c & 15]; }
    else result += c;
  }
  return result + "\"";
}
int main(int argc, char **argv) {
  if (argc != 3) { std::cerr << "Usage: everyhint-transcriber MODEL THREADS\n"; return 2; }
#ifdef _WIN32
  _setmode(_fileno(stdin), _O_BINARY);
#endif
  int threads = 0;
  try { threads = std::stoi(argv[2]); } catch (...) { return 2; }
  if (threads < 1 || threads > 8) return 2;
  const auto loadStart = Clock::now();
  auto config = whisper_context_default_params(); config.use_gpu = false;
  std::unique_ptr<whisper_context, decltype(&whisper_free)> context(whisper_init_from_file_with_params(argv[1], config), whisper_free);
  if (!context) { std::cout << "{\"type\":\"error\",\"message\":\"Whisper model could not load\"}" << std::endl; return 3; }
  std::cout << "{\"type\":\"ready\",\"loadMs\":" << elapsed(loadStart) << ",\"memoryBytes\":" << memoryBytes() << "}" << std::endl;
  while (true) {
    std::uint32_t header[4];
    if (!std::cin.read(reinterpret_cast<char *>(header), sizeof(header))) return std::cin.eof() ? 0 : 4;
    if (header[0] != 0x45574833 || header[1] == 0 || header[2] < 1600 || header[2] > 240000 || header[3] != 0) return 4;
    std::vector<float> audio(header[2]);
    if (!std::cin.read(reinterpret_cast<char *>(audio.data()), static_cast<std::streamsize>(audio.size() * sizeof(float)))) return 4;
    if (std::any_of(audio.begin(), audio.end(), [](float sample) { return !std::isfinite(sample) || std::abs(sample) > 1.001f; })) return 4;
    auto params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.n_threads = threads; params.language = "en"; params.translate = false;
    params.no_context = true; params.no_timestamps = true; params.single_segment = true;
    params.print_special = false; params.print_progress = false; params.print_realtime = false; params.print_timestamps = false;
    params.temperature = 0.0f; params.temperature_inc = 0.0f;
    const auto started = Clock::now();
    const double cpuStarted = cpuMs();
    if (whisper_full(context.get(), params, audio.data(), static_cast<int>(audio.size())) != 0) {
      std::cout << "{\"type\":\"error\",\"id\":" << header[1] << ",\"message\":\"Whisper inference failed\"}" << std::endl; return 5;
    }
    std::string text;
    for (int i = 0; i < whisper_full_n_segments(context.get()); ++i) {
      text += whisper_full_get_segment_text(context.get(), i);
      if (text.size() > 16000) { std::cerr << "Recognition text exceeded limit\n"; return 5; }
    }
    const double latency = elapsed(started);
    std::cout << "{\"type\":\"result\",\"id\":" << header[1] << ",\"text\":" << json(text) << ",\"latencyMs\":" << latency << ",\"cpuPercent\":" << (latency > 0 ? (cpuMs() - cpuStarted) * 100 / latency : 0) << ",\"memoryBytes\":" << memoryBytes() << "}" << std::endl;
  }
}
