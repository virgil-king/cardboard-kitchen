import { readFile } from "node:fs/promises";
import * as Plot from "@observablehq/plot";
import { JSDOM } from "jsdom";
import { kingdominoExperiment } from "./config.js";
import { EvalLogEntry } from "./eval-worker.js";
import { requireDefined, sum } from "game";
import { Map, Seq } from "immutable";

// This script emits an SVG line graph based on the data from an experiment log

const log: Array<EvalLogEntry> = JSON.parse(
  await readFile(await kingdominoExperiment.logFile(), {
    encoding: "utf-8",
  })
);

function computeChartData() {
  return log.flatMap((logEntry) => {
    const frames = requireDefined(logEntry.modelMetadata).trainingSampleCount;
    const totalValue = sum(
      Seq(logEntry.results.map(([id, { value, timeMs }]) => value))
    );
    let scaleFactor: number;
    if (totalValue > 300) {
      scaleFactor = 64 * 3;
    } else {
      scaleFactor = 64;
    }
    let agentIdToAdjustedValue = Map(
      logEntry.results.map(([id, { value }]) => [id, value / scaleFactor])
    );
    return logEntry.results.map(([playerId, result]) => {
      return {
        playerId: playerId,
        frames: frames,
        value: agentIdToAdjustedValue.get(playerId),
      };
    });
  });
}

const chartData = computeChartData();

const plot = Plot.plot({
  document: new JSDOM("").window.document,
  // The following line currently causes the whole chart to become invisible
  // color: { legend: true },
  marks: [
    Plot.line(chartData, {
      x: "frames",
      y: "value",
      stroke: "playerId",
    }),
  ],
});

plot.setAttributeNS(
  "http://www.w3.org/2000/xmlns/",
  "xmlns",
  "http://www.w3.org/2000/svg"
);
plot.setAttributeNS(
  "http://www.w3.org/2000/xmlns/",
  "xmlns:xlink",
  "http://www.w3.org/1999/xlink"
);

process.stdout.write(plot.outerHTML);
