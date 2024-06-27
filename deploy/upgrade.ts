import { ethers, upgrades } from "hardhat";

const beaconAddress = process.env["BEACON_ADDRESS"] || "";
const servingAddress = process.env["SERVING_ADDRESS"] || "";

if (!beaconAddress) {
    throw new Error("BEACON_ADDRESS unset");
}

if (!servingAddress) {
    throw new Error("SERVING_ADDRESS unset");
}

async function main() {
    const ServingV2 = await ethers.getContractFactory("ServingV2");
    await upgrades.upgradeBeacon(beaconAddress, ServingV2);
    await ServingV2.attach(servingAddress);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
