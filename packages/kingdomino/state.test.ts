import { Episode, EpisodeConfiguration, Player, Players } from "game";
import { KingdominoAction } from "./action.js";
import { Kingdomino } from "./kingdomino.js";
import { Direction, Vector2 } from "./util.js";

import { test } from "vitest";
import { assert } from "chai";
import { Terrain } from "./tile.js";
import {
  ClaimTile,
  KingdominoConfiguration,
  PlaceTile,
  centerX,
  centerY,
} from "./base.js";
import { KingdominoState, NextAction } from "./state.js";
import _ from "lodash";
import { requireDefined, valueObjectsEqual } from "studio-util";
import { List } from "immutable";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");

test("newGame: board has castle in center", () => {
  const players = new Players(alice, bob);

  const episode = episodeWithPlayers(players);

  for (let player of players.players) {
    assert.equal(
      episode.currentSnapshot.state.locationState(
        player,
        new Vector2(centerX, centerY)
      ).terrain,
      Terrain.TERRAIN_CENTER
    );
  }
});

test("newGame: current player is first in list", () => {
  const players = new Players(alice, bob);

  const episode = episodeWithPlayers(players);

  assert.equal(
    episode.currentSnapshot.state.currentPlayerId,
    alice.id,
    "first player should be alice"
  );
});

test("newGame: previous offers is undefined", () => {
  const players = new Players(alice, bob);

  const episode = episodeWithPlayers(players);

  assert.equal(episode.currentSnapshot.state.props.previousOffers, undefined);
});

test("newGame: two players: offer has four tiles", () => {
  const players = new Players(alice, bob);

  const episode = episodeWithPlayers(players);

  assert.equal(episode.currentSnapshot.state.props.nextOffers?.offers.size, 4);
});

test("newGame: three players: offer has three tiles", () => {
  const players = new Players(alice, bob, cecile);

  const episode = episodeWithPlayers(players);

  assert.equal(episode.currentSnapshot.state.props.nextOffers?.offers.size, 3);
});

test("newGame: four players: offer has four tiles", () => {
  const players = new Players(alice, bob, cecile, derek);

  const episode = episodeWithPlayers(players);

  assert.equal(episode.currentSnapshot.state.props.nextOffers?.offers.size, 4);
});

test("newGame: no previous offers", () => {
  const players = new Players(alice, bob, cecile, derek);

  const episode = episodeWithPlayers(players);

  assert.equal(episode.currentSnapshot.state.props.previousOffers, undefined);
});

test("newGame: next action is claim", () => {
  const players = new Players(alice, bob, cecile, derek);

  const episode = episodeWithPlayers(players);

  assert.equal(
    episode.currentSnapshot.state.nextAction,
    NextAction.CLAIM_OFFER
  );
});

test("newGame: scripted tiles: uses scripted tiles", () => {
  const players = new Players(alice, bob, cecile);

  const episode = episodeWithPlayers(players, [1, 2, 3]);

  assert.isTrue(
    requireDefined(episode.currentSnapshot.state.props.nextOffers)
      .offers.map((offer) => requireDefined(offer.tileNumber))
      .equals(List([1, 2, 3]))
  );
});

test("withNewNextOffers: adds new offer tiles to drawnTileNumbers", () => {
  const players = new Players(alice, bob, cecile, derek);

  const state = episodeWithPlayers(players).currentSnapshot.state;

  assert.equal(state.props.drawnTileNumbers.size, 4);
  for (const offer of requireDefined(state.props.nextOffers).offers) {
    assert.isTrue(
      state.props.drawnTileNumbers.contains(requireDefined(offer.tileNumber))
    );
  }
});

test("currentPlayer: after one action: returns second player", () => {
  const players = new Players(alice, bob);
  const episode = episodeWithPlayers(players);

  episode.apply(claim(1));

  assert.equal(episode.currentSnapshot.state.currentPlayerId, bob.id);
});

test("currentPlayer: second round: returns player with first claim", () => {
  const players = new Players(alice, bob, cecile);
  const episode = episodeWithPlayers(players);
  episode.apply(claim(2), claim(1), claim(0));

  assert.equal(episode.currentSnapshot.state.currentPlayerId, cecile.id);
});

test("claimTile: first round: next action is claim", () => {
  const players = new Players(alice, bob, cecile);
  const episode = episodeWithPlayers(players).apply(claim(2));

  assert.equal(
    episode.currentSnapshot.state.nextAction,
    NextAction.CLAIM_OFFER
  );
});

test("claimTile: already claimed: throws", () => {
  const players = new Players(alice, bob, cecile);
  const episode = episodeWithPlayers(players).apply(claim(2));
  // const state = unroll(episode, [claim(alice, 2)]);

  assert.throws(() => {
    episode.apply(claim(2));
  });
});

test("claimTile: second round: next action is place", () => {
  const players = new Players(alice, bob, cecile);
  const episode = episodeWithPlayers(players).apply(
    claim(2),
    claim(1),
    claim(0),
    KingdominoAction.placeTile(
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT)
    ),
    KingdominoAction.claimTile(new ClaimTile(0))
  );

  assert.equal(
    episode.currentSnapshot.state.nextAction,
    NextAction.RESOLVE_OFFER
  );
});

test("placeTile: last round: updates next player", () => {
  const players = new Players(alice, bob, cecile);
  const episode = episodeWithPlayers(players, _.range(1, 4)).apply(
    claim(0),
    claim(1),
    claim(2),
    KingdominoAction.placeTile(
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT)
    )
  );

  assert.equal(episode.currentSnapshot.state.currentPlayerId, bob.id);
});

test("placeTile: end of game: next action is undefined", () => {
  const players = new Players(alice, bob, cecile);
  const episode = episodeWithPlayers(players, _.range(1, 4)).apply(
    claim(0),
    claim(1),
    claim(2),
    KingdominoAction.placeTile(
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT)
    ),
    KingdominoAction.placeTile(
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT)
    ),
    KingdominoAction.placeTile(
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT)
    )
  );

  assert.equal(episode.currentSnapshot.state.nextAction, undefined);
});

test("placeTile: end of game: center bonus applied correctly", () => {
  const players = new Players(alice, bob);
  const episode = episodeWithPlayers(players, _.range(1, 5)).apply(
    claim(0),
    claim(1),
    claim(2),
    claim(3),
    KingdominoAction.placeTile(
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT)
    ),
    KingdominoAction.placeTile(
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT)
    ),
    KingdominoAction.placeTile(
      new PlaceTile(new Vector2(-1, 0), Direction.LEFT)
    ),
    KingdominoAction.placeTile(
      new PlaceTile(new Vector2(0, 1), Direction.UP)
    )
  );

  assert.equal(episode.currentSnapshot.state.requirePlayerState(alice.id).score, 10);
  assert.equal(episode.currentSnapshot.state.requirePlayerState(bob.id).score, 0);
  // const result = episode.currentSnapshot.state.result;
  // assert.equal(episode.currentSnapshot.state.nextAction, undefined);
});

test("encode/decode round trip", () => {
  const players = new Players(alice, bob);
  const episode = episodeWithPlayers(players).apply(
    claim(0),
    claim(1),
    claim(2),
    claim(3),
    KingdominoAction.placeTile(
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT)
    )
  );
  const beforeState = episode.currentSnapshot.state;

  const afterState = KingdominoState.decode(
    episode.currentSnapshot.state.toJson()
  );

  // console.log(JSON.stringify(beforeState, undefined, 1));
  // console.log(JSON.stringify(afterState, undefined, 1));

  assert.equal(
    beforeState.props.currentPlayerId,
    afterState.props.currentPlayerId
  );
  assert.isTrue(
    beforeState.props.drawnTileNumbers.equals(afterState.props.drawnTileNumbers)
  );
  assert.equal(beforeState.props.nextAction, afterState.props.nextAction);
  assert.isTrue(
    valueObjectsEqual(
      beforeState.props.previousOffers,
      afterState.props.previousOffers
    )
  );
  assert.isTrue(
    valueObjectsEqual(beforeState.props.nextOffers, afterState.props.nextOffers)
  );
  assert.isTrue(
    beforeState.props.playerIdToState.equals(afterState.props.playerIdToState)
  );
  assert.equal(
    beforeState.props.offsetInScriptedTileNumbers,
    afterState.props.offsetInScriptedTileNumbers
  );
});

function episodeWithPlayers(
  players: Players,
  shuffledTileNumbers: Array<number> | undefined = undefined
): Episode<KingdominoConfiguration, KingdominoState, KingdominoAction> {
  const episodeConfig = new EpisodeConfiguration(players);
  const snapshot = kingdomino.newKingdominoEpisode(
    new EpisodeConfiguration(players),
    shuffledTileNumbers
  );
  return new Episode(kingdomino, snapshot);
}

function claim(offerIndex: number) {
  return KingdominoAction.claimTile(new ClaimTile(offerIndex));
}
