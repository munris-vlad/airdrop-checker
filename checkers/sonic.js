import {
    generateRandomUserAgent,
    getKeyByValue,
    readWallets
} from '../utils/common.js'
import axios from "axios"
import { Table } from 'console-table-printer'
import { createObjectCsvWriter } from 'csv-writer'
import cliProgress from 'cli-progress'
import { HttpsProxyAgent } from "https-proxy-agent"
import { SocksProxyAgent } from "socks-proxy-agent"

let columns = [
    { name: 'n', color: 'green', alignment: "right"},
    { name: 'wallet', color: 'green', alignment: "right"},
    { name: 'vesting', color: 'green', alignment: "right"},
    { name: 'bonus', color: 'green', alignment: "right"},
    { name: 'instant', color: 'green', alignment: "right"},
]

let headers = [
    { id: 'n', title: '№'},
    { id: 'wallet', title: 'wallet'},
    { id: 'vesting', title: 'vesting'},
    { id: 'bonus', title: 'bonus'},
    { id: 'instant', title: 'instant'},
]

let debug = true
let p
let csvWriter
let wallets = readWallets('./addresses/solana.txt')
let proxies = readWallets('./proxies.txt')
let iterations = wallets.length
let iteration = 1
let stats = []
let csvData = []
let total1 = 0
let total2 = 0
let total3 = 0
const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)

async function checkAirdrop(wallet, proxy = null) {
    let config = {
        timeout: 25000,
        "headers": {
            "User-Agent": generateRandomUserAgent(),
        },
    }

    if (proxy) {
        if (proxy.includes('http')) {
            config.httpsAgent = new HttpsProxyAgent(proxy)
        }

        if (proxy.includes('socks')) {
            config.httpsAgent = new SocksProxyAgent(proxy)
        }
    }

    let isFetched = false
    let retries = 0

    stats[wallet].airdrop = 0

    while (!isFetched) {
        await axios.get(`https://airdrop.sonic.game/api/allocations?wallet=${wallet}`, config).then(async response => {
            stats[wallet].vesting = parseFloat(response.data[0].total) > 0 ? parseFloat(response.data[0].total) : 0
            stats[wallet].bonus = parseFloat(response.data[1].total) > 0 ? parseFloat(response.data[1].total) : 0
            stats[wallet].instant = parseFloat(response.data[2].total) > 0 ? parseFloat(response.data[2].total) : 0
            total1 += parseInt(stats[wallet].vesting)
            total2 += parseInt(stats[wallet].bonus)
            total3 += parseInt(stats[wallet].instant)
            isFetched = true
        }).catch(e => {
            if (debug) console.log('balances', e.toString())

            retries++

            if (retries >= 3) {
                isFetched = true
            }
        })
    }
}

async function fetchWallet(wallet, index) {

    let proxy = null
    if (proxies.length) {
        if (proxies[index]) {
            proxy = proxies[index]
        } else {
            proxy = proxies[0]
        }
    }

    stats[wallet] = {
        vesting: 0,
        bonus: 0,
        instant: 0,
    }

    await checkAirdrop(wallet, proxy)

    progressBar.update(iteration)

    let row = {
        n: parseInt(index)+1,
        wallet: wallet,
        vesting: stats[wallet].vesting,
        bonus: stats[wallet].bonus,
        instant: stats[wallet].instant,
    }

    p.addRow(row, { color: "cyan" })

    iteration++
}

async function fetchWallets() {
    iterations = wallets.length
    iteration = 1
    csvData = []

    let batchSize = 1
    let timeout = 1000

    if (proxies.length) {
        batchSize = 10
        timeout = 1000
    }

    const batchCount = Math.ceil(wallets.length / batchSize)
    const walletPromises = []

    p = new Table({
        columns: columns,
        sort: (row1, row2) => +row1.n - +row2.n
    })

    csvWriter = createObjectCsvWriter({
        path: './results/sonic.csv',
        header: headers
    })

    for (let i = 0; i < batchCount; i++) {
        const startIndex = i * batchSize
        const endIndex = (i + 1) * batchSize
        const batch = wallets.slice(startIndex, endIndex)

        const promise = new Promise((resolve) => {
            setTimeout(() => {
                resolve(fetchBatch(batch))
            }, i * timeout)
        })

        walletPromises.push(promise)
    }

    await Promise.all(walletPromises)
    return true
}

async function fetchBatch(batch) {
    await Promise.all(batch.map((account, index) => fetchWallet(account, getKeyByValue(wallets, account))))
}

async function saveToCsv() {
    p.table.rows.map((row) => {
        csvData.push(row.text)
    })
    csvData.sort((a, b) => a.n - b.n)
    csvWriter.writeRecords(csvData).then().catch()
}

async function addTotalRow() {
    p.addRow({})

    let row = {
        wallet: 'Total',
        vesting: total1,
        bonus: total2,
        instant: total3,
    }

    p.addRow(row, { color: "cyan" })
}

export async function sonicAirdropChecker() {
    progressBar.start(iterations, 0)
    await fetchWallets()
    await addTotalRow()
    await saveToCsv()
    progressBar.stop()
    p.printTable()
}