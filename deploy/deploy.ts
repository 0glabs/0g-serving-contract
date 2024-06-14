import { ethers, upgrades } from "hardhat";

const lockTime = parseInt(process.env["LOCK_TIME"] || "86400");

async function main() {
    const DataRetrieve = await ethers.getContractFactory("DataRetrieve");

    const beacon = await upgrades.deployBeacon(DataRetrieve);
    await beacon.waitForDeployment();
    console.log("Beacon address:", await beacon.getAddress());

    const dataRetrieve = await upgrades.deployBeaconProxy(beacon, DataRetrieve, [lockTime]);
    await dataRetrieve.waitForDeployment();
    console.log("Proxy address:", await dataRetrieve.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
