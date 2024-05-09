import _ from "lodash";
import { Episode, Player, PlayerState, Players, runEpisode } from "game";
import {
  Kingdomino,
  RandomKingdominoAgent,
  KingdominoState,
  KingdominoAction,
  Terrain,
} from "kingdomino";
import { playAreaRadius } from "kingdomino/out/base";
import { Vector2, requireDefined } from "kingdomino/out/util";

import styles from "./page.module.css";
import { PlayerBoard } from "kingdomino/out/board";
import { KingdominoPlayerState } from "kingdomino/out/state";

const kingdomino: Kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const players = new Players([alice, bob]);
const randomAgent = new RandomKingdominoAgent();
const agents = new Map([
  [alice.id, randomAgent],
  [bob.id, randomAgent],
]);

export default function Home() {
  const episode: Episode<KingdominoState, KingdominoAction> = runEpisode(
    kingdomino,
    players,
    agents
  );
  const state = episode.currentState;
  const playerComponents = state.props.players.players.map((player) => {
    return <PlayerComponent playerState={state.requirePlayerState(player)} />;
  });

  return <div className={styles.horizontalFlex}>{playerComponents}</div>;
}

type PlayerProps = {
  playerState: KingdominoPlayerState;
};

function PlayerComponent(props: PlayerProps) {
  return (
    <div className={styles.verticalFlex}>
      <div style={{ textAlign: "center" }}>{props.playerState.player.name}</div>
      <div style={{ textAlign: "center" }}>
        Score: {props.playerState.gameState.score}
      </div>
      <div>
        <BoardComponent board={props.playerState.board} />
      </div>
    </div>
  );
}

type BoardProps = {
  board: PlayerBoard;
};

function BoardComponent(props: BoardProps) {
  const rows = _.range(-playAreaRadius, playAreaRadius + 1).map((row) => {
    const cells = _.range(-playAreaRadius, playAreaRadius + 1).map((column) => {
      const locationState = props.board.getLocationState(
        new Vector2(column, row)
      );
      return (
        <Square terrain={locationState.terrain} crowns={locationState.crowns} />
      );
    });
    return <tr key={row}>{cells}</tr>;
  });

  return (
    <table className={styles.center}>
      <tbody>{rows}</tbody>
    </table>
  );
}

type SquareProps = {
  terrain: Terrain;
  crowns: number;
};

type TerrainRenderingInfo = {
  styleName: string;
  textContent?: string;
};

const terrainToRenderingInfo = new Map([
  [
    Terrain.TERRAIN_CENTER,
    { styleName: styles.center, textContent: String.fromCodePoint(0x1f3f0) },
  ],
  [Terrain.TERRAIN_EMPTY, { styleName: styles.empty }],
  [Terrain.TERRAIN_HAY, { styleName: styles.hay }],
  [Terrain.TERRAIN_WATER, { styleName: styles.water }],
  [Terrain.TERRAIN_FOREST, { styleName: styles.forest }],
  [Terrain.TERRAIN_PASTURE, { styleName: styles.pasture }],
  [Terrain.TERRAIN_SWAMP, { styleName: styles.swamp }],
  [Terrain.TERRAIN_MINE, { styleName: styles.mine }],
]);

function Square(props: SquareProps) {
  let renderingInfo = requireDefined(terrainToRenderingInfo.get(props.terrain));
  const classNames = `${styles.boardsquare} ${renderingInfo.styleName}`;
  let text: string;
  if (renderingInfo.textContent != undefined) {
    text = renderingInfo.textContent;
  } else if (props.crowns > 0) {
    text = Array(props.crowns).fill(String.fromCodePoint(0x1F451)).join("");
  } else {
    text = "";
  }
  return <td className={classNames}>{text}</td>;
}

// return (
//   <main className={styles.main}>
//     <div className={styles.description}>
//       <p>
//         Get started by editing&nbsp;
//         <code className={styles.code}>app/page.tsx</code>
//       </p>
//       <div>
//         <a
//           href="https://vercel.com?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
//           target="_blank"
//           rel="noopener noreferrer"
//         >
//           By{" "}
//           <Image
//             src="/vercel.svg"
//             alt="Vercel Logo"
//             className={styles.vercelLogo}
//             width={100}
//             height={24}
//             priority
//           />
//         </a>
//       </div>
//     </div>

//     <div className={styles.center}>
//       <Image
//         className={styles.logo}
//         src="/next.svg"
//         alt="Next.js Logo"
//         width={180}
//         height={37}
//         priority
//       />
//     </div>

//     <div className={styles.grid}>
//       <a
//         href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
//         className={styles.card}
//         target="_blank"
//         rel="noopener noreferrer"
//       >
//         <h2>
//           Docs <span>-&gt;</span>
//         </h2>
//         <p>Find in-depth information about Next.js features and API.</p>
//       </a>

//       <a
//         href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
//         className={styles.card}
//         target="_blank"
//         rel="noopener noreferrer"
//       >
//         <h2>
//           Learn <span>-&gt;</span>
//         </h2>
//         <p>Learn about Next.js in an interactive course with&nbsp;quizzes!</p>
//       </a>

//       <a
//         href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
//         className={styles.card}
//         target="_blank"
//         rel="noopener noreferrer"
//       >
//         <h2>
//           Templates <span>-&gt;</span>
//         </h2>
//         <p>Explore starter templates for Next.js.</p>
//       </a>

//       <a
//         href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
//         className={styles.card}
//         target="_blank"
//         rel="noopener noreferrer"
//       >
//         <h2>
//           Deploy <span>-&gt;</span>
//         </h2>
//         <p>
//           Instantly deploy your Next.js site to a shareable URL with Vercel.
//         </p>
//       </a>
//     </div>
//   </main>
// );
// }
