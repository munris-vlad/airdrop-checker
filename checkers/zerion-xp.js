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
    { name: 'xp', color: 'green', alignment: "right"},
    { name: 'position', color: 'green', alignment: "right"},
]

let headers = [
    { id: 'n', title: '№'},
    { id: 'wallet', title: 'wallet'},
    { id: 'xp', title: 'xp'},
    { id: 'position', title: 'position'},
]

let debug = true
let p
let csvWriter
let wallets = readWallets('./addresses/evm.txt')
let proxies = readWallets('./proxies.txt')
let iterations = wallets.length
let iteration = 1
let stats = []
let csvData = []
let totalxp = 0
const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)

async function checkXp(wallet, proxy = null) {
    let config = {
        timeout: 5000,
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

    stats[wallet].xp = 0

    while (!isFetched) {
        await axios.get(`https://dna.zerion.io/api/v1/leaders/${wallet}`, config).then(async response => {
            stats[wallet].xp = response.data.earnedXP ? parseInt(response.data.earnedXP) : 0
            stats[wallet].position = response.data.position ? parseInt(response.data.position) : 0
            totalxp += parseInt(stats[wallet].xp)
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
        xp: 0,
        position: 0
    }

    await checkXp(wallet, proxy)

    progressBar.update(iteration)

    let row = {
        n: parseInt(index)+1,
        wallet: wallet,
        xp: stats[wallet].xp,
        position: stats[wallet].position,
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
        path: './results/zerionXp.csv',
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
        xp: totalxp
    }

    p.addRow(row, { color: "cyan" })
}

export async function zerionXpAirdropChecker() {
    progressBar.start(iterations, 0)
    await fetchWallets()
    await addTotalRow()
    await saveToCsv()
    progressBar.stop()
    p.printTable()
}