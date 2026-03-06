const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    const deployerAddress = "0x9f2EdCE3a34e42eaf8f965d4E14aDDd12Cf865f4";
    const registrarAddress = "0xb0E49c5D0d05cbc241d68c05BC5BA1d1B7B72976";

    console.log("Searching for the registration transaction...");

    // Get the latest block
    const latestBlock = await provider.getBlockNumber();

    // Since we just ran the script, we look back a few blocks
    for (let i = latestBlock; i > latestBlock - 50; i--) {
        const block = await provider.getBlock(i, true);
        if (!block) continue;

        for (const tx of block.prefetchedTransactions) {
            if (tx.from && tx.from.toLowerCase() === deployerAddress.toLowerCase() &&
                tx.to && tx.to.toLowerCase() === registrarAddress.toLowerCase()) {

                console.log(`Found transaction: ${tx.hash}`);
                const receipt = await provider.getTransactionReceipt(tx.hash);

                // Automation Registrar Log Topic for UpkeepRegistered
                // UpkeepRegistered (index_topic_1 uint256 id, uint32 remainingEth, uint32 remainingLink)
                // Actually, the topic for UpkeepRegistered (uint256 id) is standard.
                // Let's just log all logs to be sure.

                for (const log of receipt.logs) {
                    if (log.address.toLowerCase() === registrarAddress.toLowerCase()) {
                        console.log("Log found from Registrar:");
                        // The upkeep ID is usually the first data field or first topic
                        // For UpkeepRegistered(uint256 id)
                        try {
                            const id = ethers.toBigInt(log.topics[1]);
                            console.log(`Potential Upkeep ID: ${id.toString()}`);
                        } catch (e) {
                            // ignore
                        }
                    }
                }
                return;
            }
        }
    }
}

main().catch(console.error);
