import {
    generateRandomUserAgent,
    getKeyByValue,
    readWallets
} from '../utils/common.js'
import { Table } from 'console-table-printer'
import { createObjectCsvWriter } from 'csv-writer'
import cliProgress from 'cli-progress'
import { gotScraping } from 'got-scraping'

let columns = [
    { name: 'n', color: 'green', alignment: "right"},
    { name: 'wallet', color: 'green', alignment: "right"},
    { name: 'airdrop', color: 'green', alignment: "right"},
    { name: 'unclaimed', color: 'green', alignment: "right"},
]

let headers = [
    { id: 'n', title: '№'},
    { id: 'wallet', title: 'wallet'},
    { id: 'airdrop', title: 'airdrop'},
    { id: 'unclaimed', title: 'unclaimed'},
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
let totalAirdrop = 0
let totalUnclaimed = 0
const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)

async function checkAirdrop(wallet, proxy = null) {
    const client = gotScraping.extend({
        headers: {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "priority": "u=1, i",
            "sec-ch-ua": "\"Not)A;Brand\";v=\"99\", \"Google Chrome\";v=\"127\", \"Chromium\";v=\"127\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"macOS\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "cross-site",
            "Referer": "https://claim.pudgypenguins.com/",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        },
        ...(proxy ? { proxyUrl: proxy } : {}),
        retry: {
            limit: 3,
            methods: ['GET', 'POST'],
            maxRetryAfter: undefined,
            backoffLimit: 5000,
            noise: 100
        },
        hooks: {
            beforeRetry: [
                (error, retryCount) => {
                    if (debug) console.log(`retry ${retryCount} - ${error.message}`)
                }
            ],
        }
    })

    let isFetched = false
    let retries = 0

    stats[wallet].airdrop = 0

    while (!isFetched) {
        await client(`https://api.clusters.xyz/v0.1/airdrops/pengu/eligibility/${wallet}`).json().then(result => {
            stats[wallet].airdrop = result.total ? parseInt(result.total) : 0
            stats[wallet].unclaimed = result.totalUnclaimed ? parseInt(result.totalUnclaimed) : 0
            totalAirdrop += parseInt(stats[wallet].airdrop)
            totalUnclaimed += parseInt(stats[wallet].unclaimed)
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
        airdrop: 0,
        unclaimed: 0
    }

    await checkAirdrop(wallet, proxy)

    progressBar.update(iteration)

    let row = {
        n: parseInt(index)+1,
        wallet: wallet,
        airdrop: stats[wallet].airdrop,
        unclaimed: stats[wallet].unclaimed,
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
        path: './results/pengu.csv',
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
        airdrop: totalAirdrop,
        unclaimed: totalUnclaimed
    }

    p.addRow(row, { color: "cyan" })
}

export async function penguAirdropChecker() {
    progressBar.start(iterations, 0)
    await fetchWallets()
    await addTotalRow()
    await saveToCsv()
    progressBar.stop()
    p.printTable()
}