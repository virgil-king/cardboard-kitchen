import * as fs from "fs";

export function newestModelPath(
  gameName: string,
  modelName: string
): string | undefined {
  const home = process.env.HOME;
  const sessionsDir = `${home}/models/${gameName}/${modelName}`;
  try {
    const sessionNames = fs.readdirSync(sessionsDir);
    if (sessionNames.length == 0) {
      return undefined;
    }
    sessionNames.sort().reverse();
    const modelsDir = `${sessionsDir}/${sessionNames[0]}`;
    const modelNames = fs.readdirSync(modelsDir);
    if (modelNames.length == 0) {
      return undefined;
    }
    modelNames.sort().reverse();
    return `${modelsDir}/${modelNames[0]}`;
  } catch (e: any) {
    console.log(`Error loading model: ${e}`);
    return undefined;
  }
}
