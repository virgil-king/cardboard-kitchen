import * as fs from "fs";

export function modelsDirectory(gameName: string, modelName: string): string {
  const home = process.env.HOME;
  return `${home}/ckdata/${gameName}/models/${modelName}`;
}

export function newestModelPath(
  gameName: string,
  modelName: string
): string | undefined {
  // const home = process.env.HOME;
  const modelsDir = modelsDirectory(gameName, modelName);
  try {
    const modelDirs = fs.readdirSync(modelsDir).sort();
    if (modelDirs.length == 0) {
      console.log(`No model directories`);
      return undefined;
    }
    const newestModelDir = modelDirs[modelDirs.length - 1];
    return `${modelsDir}/${newestModelDir}`;
    // for (const sessionName of sessionNames.sort().reverse()) {
    //   const modelDirName = newestModelDirectory(
    //     `${sessionsDir}/${sessionName}`
    //   );
    //   if (modelDirName != undefined) {
    //     return `${sessionsDir}/${sessionName}/${modelDirName}`;
    //   }
    // }
    // return undefined;
    // const modelsDir = `${sessionsDir}/${sessionNames[0]}`;
    // const modelNames = fs.readdirSync(modelsDir);
    // if (modelNames.length == 0) {
    //   console.log(`No model directories`);
    //   return undefined;
    // }
    // modelNames.sort().reverse();
    // return `${modelsDir}/${modelNames[0]}`;
  } catch (e: any) {
    console.log(`Error loading model: ${e}`);
    return undefined;
  }
}

// function newestModelDirectory(sessionDirPath: string): string | undefined {
//   const modelDirs = fs.readdirSync(sessionDirPath).sort();
//   if (modelDirs.length == 0) {
//     return undefined;
//   }
//   return modelDirs[modelDirs.length - 1];
// }
