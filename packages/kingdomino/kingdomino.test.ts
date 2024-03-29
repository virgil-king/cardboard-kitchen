import { Kingdomino } from "./kingdomino.js";
import { assert, expect, test } from 'vitest';

let kingdomino = new Kingdomino()

test("new game", () => {
    kingdomino.newGame(3)
})


// test("shuffle result has same length", () => {
//     // console.log(shuffle)
//     assert(shuffle<Number>([1, 5, 9]).length == 3, "shuffled length should be unchanged")
// })
