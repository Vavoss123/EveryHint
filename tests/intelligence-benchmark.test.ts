import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  detectQuestion,
  normalizeQuestion,
} from "../src/main/intelligence/question";
import { ScreenChangeDetector } from "../src/main/intelligence/screen";
import {
  classifierDevelopment,
  classifierEvaluation,
} from "./fixtures/intelligence-corpus";
import { frame } from "./helpers";

function classifier() {
  const vocabulary = new Set<string>();
  const counts = [new Map<string, number>(), new Map<string, number>()];
  const totals: [number, number] = [0, 0],
    documents: [number, number] = [0, 0];
  for (const [text, positive] of classifierDevelopment) {
    const index = positive ? 1 : 0;
    documents[index]++;
    for (const word of normalizeQuestion(text).split(" ")) {
      vocabulary.add(word);
      counts[index]!.set(word, (counts[index]!.get(word) ?? 0) + 1);
      totals[index]++;
    }
  }
  return (text: string): boolean => {
    const scores = [0, 1].map((index) => {
      let score = Math.log(documents[index]! / classifierDevelopment.length);
      for (const word of normalizeQuestion(text).split(" "))
        score += Math.log(
          ((counts[index]!.get(word) ?? 0) + 1) /
            (totals[index]! + vocabulary.size),
        );
      return score;
    });
    return 1 / (1 + Math.exp(scores[0]! - scores[1]!)) >= 0.85;
  };
}
function quality(predict: (text: string) => boolean) {
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  for (const [text, expected] of classifierEvaluation) {
    const actual = predict(text);
    if (actual && expected) tp++;
    else if (actual) fp++;
    else if (expected) fn++;
    else tn++;
  }
  return {
    tp,
    fp,
    fn,
    tn,
    precision: tp / (tp + fp || 1),
    recall: tp / (tp + fn || 1),
    accuracy: (tp + tn) / classifierEvaluation.length,
  };
}
describe("P7.1 reproducible local comparison and observations", () => {
  it("compares a small classifier against conservative rules and records bounded local processing observations", () => {
    const bayes = classifier();
    const rules = quality((text) =>
      Boolean(detectQuestion(text)?.automaticEligible),
    );
    const candidate = quality(bayes);
    expect(rules.precision).toBeGreaterThanOrEqual(0.9);
    expect(rules.recall).toBeGreaterThanOrEqual(0.8);
    const timings: number[] = [];
    const startMemory = process.memoryUsage();
    const startCpu = process.cpuUsage();
    const start = performance.now();
    for (let i = 0; i < 3200; i++) {
      const at = performance.now();
      detectQuestion(classifierEvaluation[i % classifierEvaluation.length]![0]);
      timings.push(performance.now() - at);
    }
    const duration = performance.now() - start;
    timings.sort((a, b) => a - b);
    const detector = new ScreenChangeDetector();
    let sampled = 0;
    const sample = () => {
      sampled++;
      return new Uint8Array(576).fill(120);
    };
    const screenStart = performance.now();
    for (let i = 0; i < 1000; i++)
      detector.observe({ ...frame, capturedAt: 1000000 + i * 1000 }, sample);
    const hashMs = performance.now() - screenStart;
    expect(sampled).toBe(1);
    const cpu = process.cpuUsage(startCpu),
      memory = process.memoryUsage();
    const report = {
      fixture:
        "synthetic English; 22 development / 32 distinct evaluation texts",
      rules,
      candidateNaiveBayes: candidate,
      decision:
        candidate.precision > rules.precision && candidate.recall > rules.recall
          ? "Investigate classifier further; synthetic comparison alone does not authorise deployment"
          : "Keep conservative rules; candidate offers no joint held-out precision/recall improvement",
      detection: {
        calls: 3200,
        totalMs: duration,
        meanMs: duration / 3200,
        p95Ms: timings[Math.floor(timings.length * 0.95)],
      },
      unchangedScreen: {
        frames: 1000,
        totalHashMs: hashMs,
        samples: sampled,
        gridBytes: 576,
      },
      processObservation: {
        cpuUserMs: cpu.user / 1000,
        cpuSystemMs: cpu.system / 1000,
        heapDeltaBytes: memory.heapUsed - startMemory.heapUsed,
        rssBytes: memory.rss,
      },
      remoteRequests: 0,
      hardwareAcceptance: false,
    };
    mkdirSync("artifacts", { recursive: true });
    writeFileSync(
      "artifacts/p7-local-benchmark.json",
      JSON.stringify(report, null, 2),
    );
  });
});
