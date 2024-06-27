import { ethers, upgrades } from "hardhat";

const lockTime = parseInt(process.env["LOCK_TIME"] || "86400");

async function main() {
    const Serving = await ethers.getContractFactory("Serving");

    const beacon = await upgrades.deployBeacon(Serving);
    await beacon.waitForDeployment();
    console.log("Beacon address:", await beacon.getAddress());

    const serving = await upgrades.deployBeaconProxy(beacon, Serving, [lockTime]);
    await serving.waitForDeployment();
    console.log("Proxy address:", await serving.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
