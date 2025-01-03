import { taikoAirdropChecker } from "./checkers/taiko.js"
import { zerionXpAirdropChecker } from "./checkers/zerion-xp.js"
import { entryPoint } from "./utils/common.js"

async function startMenu(menu) {
    let startOver = true
    if (menu === undefined) {
        mode = await entryPoint()
    } else {
        startOver = false
    }

    switch (mode) {
        case "taiko":
            taikoAirdropChecker()
            break
        case "zerionxp":
            zerionXpAirdropChecker()
            break
    }
}

const args = process.argv.slice(2)
let mode = args[0]

await startMenu(mode)
