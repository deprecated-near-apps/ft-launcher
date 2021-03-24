
const BN = require('bn.js')
const { getAccountBalance, getAccountState, getCostPerByte } = require('./test-utils')

const cache = {}
const costs = {
    default: []
}
let recording = false

const startRecording = () => recording = true
const stopRecording = () => recording = false
const resetRecording = () => {
    recording = false
    costs = []
}

const copy = (obj) => JSON.parse(JSON.stringify(obj))

const getCosts = (whichCost = 'default') => {
    return costs[whichCost].reduce((acc, b) => new BN(acc).add(new BN(b)).toString(), '0')
}

const recordCost = (cost, whichCost = 'default') => {
    if (!costs[whichCost]) costs[whichCost] = []
    if (recording) costs[whichCost].push(cost)
}

const setMark = async (accountId) => {
    cache[accountId] = await getAccountState(accountId)
}

const getBurn = async (accountId, whichCost = 'default') => {
    const prev = copy(cache[accountId])
    if (!prev) return '0'
    const cur = cache[accountId] = await getAccountState(accountId)
    const cost = new BN(prev.amount).sub(new BN(cur.amount)).toString()
    if (recording) recordCost(cost, whichCost)
    return cost
}

const getStorage = async (accountId, whichCost = 'default') => {
    const prev = copy(cache[accountId])
    if (!prev) return '0'
    const cur = cache[accountId] = await getAccountState(accountId)
    const cost = new BN(cur.storage_usage).sub(new BN(prev.storage_usage)).mul(getCostPerByte()).toString()
    if (recording) recordCost(cost, whichCost)
    return cost
}

const getBurnAndStorage = async (accountId, whichCost = 'default') => {
    const prev = copy(cache[accountId])
    if (!prev) return '0'
    const cur = cache[accountId] = await getAccountState(accountId)
    const cost = new BN(prev.amount).sub(new BN(cur.amount)).add(
        new BN(cur.storage_usage).sub(new BN(prev.storage_usage)).mul(getCostPerByte())).toString()
        if (recording) recordCost(cost, whichCost)
    return cost
}

const getDiff = (a, b) => new BN(a).sub(new BN(b)).toString()

module.exports = { 
    getCosts,
    setMark,
    getBurn,
    getStorage,
    getBurnAndStorage,
    startRecording,
    stopRecording,
    // internal
    getDiff,
};