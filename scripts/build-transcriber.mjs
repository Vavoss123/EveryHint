import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { mkdirSync } from "node:fs";

if (process.platform === "win32") {
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "scripts/build-transcriber.ps1",
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", windowsHide: true },
  );
} else {
  if (!["darwin", "linux"].includes(process.platform))
    throw Error("Unsupported speech build platform.");
  const args = process.argv.slice(2);
  if (
    args.length &&
    (args.length !== 2 || !["--speech-home", "-SpeechHome"].includes(args[0]))
  )
    throw Error("Use --speech-home DIRECTORY.");
  const speechHome = resolve(
    args[1] ??
      process.env.EVERYHINT_SPEECH_HOME ??
      join(
        process.platform === "darwin"
          ? join(homedir(), "Library", "Application Support")
          : (process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")),
        "EveryHint",
        "speech",
      ),
  );
  const build = join(speechHome, "build"),
    runtime = join(speechHome, "runtime");
  mkdirSync(runtime, { recursive: true });
  execFileSync(
    "cmake",
    [
      "--fresh",
      "-S",
      "native/transcriber",
      "-B",
      build,
      "-DCMAKE_BUILD_TYPE=Release",
      ...(process.platform === "darwin"
        ? [
            `-DCMAKE_OSX_ARCHITECTURES=${process.arch === "arm64" ? "arm64" : "x86_64"}`,
            "-DCMAKE_OSX_DEPLOYMENT_TARGET=14.2",
          ]
        : []),
      "-DGGML_AVX=OFF",
      "-DGGML_AVX2=OFF",
      "-DGGML_FMA=OFF",
      "-DGGML_F16C=OFF",
      "-DGGML_BMI2=OFF",
    ],
    { stdio: "inherit" },
  );
  execFileSync(
    "cmake",
    [
      "--build",
      build,
      "--config",
      "Release",
      "--target",
      "everyhint-transcriber",
      "--parallel",
      "4",
    ],
    { stdio: "inherit" },
  );
  execFileSync(
    "cmake",
    [
      "--install",
      build,
      "--config",
      "Release",
      "--prefix",
      runtime,
      "--component",
      "EveryHint",
    ],
    { stdio: "inherit" },
  );
  console.log(
    `EveryHint ${process.platform}/${process.arch} speech helper installed at ${runtime}`,
  );
}
