import { ethers, upgrades } from "hardhat";
import { expect } from "chai";
import { DataRetrieve, DataRetrieve__factory } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  Block,
  ContractTransactionResponse,
  TransactionReceipt,
  randomBytes,
} from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { beforeEach } from "mocha";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import {
  RequestStruct,
  RequestTraceStruct,
} from "../typechain-types/contracts/DataRetrieve";

describe("DataRetrieve", () => {
  let DataRetrieve: DataRetrieve__factory, dataRetrieve: DataRetrieve;
  let owner: HardhatEthersSigner,
    user1: HardhatEthersSigner,
    provider1: HardhatEthersSigner,
    provider2: HardhatEthersSigner;
  let ownerAddress: string,
    user1Address: string,
    provider1Address: string,
    provider2Address: string;
  let provider1createdAt: number;

  const ownerInitialBalance = 1000;
  const user1InitialBalance = 2000;
  const lockTime = 24 * 60 * 60;

  const provider1ServiceType = randomBytes(32);
  const provider1Price = 100;
  const provider1Url = "https://example-1.com";

  const provider2ServiceType = randomBytes(32);
  const provider2Price = 100;
  const provider2Url = "https://example-2.com";

  beforeEach(async () => {
    [owner, user1, provider1, provider2] = await ethers.getSigners();
    DataRetrieve = await ethers.getContractFactory("DataRetrieve");
  });

  beforeEach(async () => {
    const beacon = await upgrades.deployBeacon(DataRetrieve);
    dataRetrieve = (await upgrades.deployBeaconProxy(beacon, DataRetrieve, [
      lockTime,
    ])) as any;

    [ownerAddress, user1Address, provider1Address, provider2Address] =
      await Promise.all([
        owner.getAddress(),
        user1.getAddress(),
        provider1.getAddress(),
        provider2.getAddress(),
      ]);

    const initializations: ContractTransactionResponse[] = await Promise.all([
      dataRetrieve.depositFund({ value: ownerInitialBalance }),
      dataRetrieve.connect(user1).depositFund({ value: user1InitialBalance }),
      dataRetrieve
        .connect(provider1)
        .addOrUpdateService(provider1ServiceType, provider1Price, provider1Url),
      dataRetrieve
        .connect(provider2)
        .addOrUpdateService(provider2ServiceType, provider2Price, provider2Url),
    ]);

    const receipt = await initializations[2].wait();
    const block = await ethers.provider.getBlock(
      (receipt as TransactionReceipt).blockNumber
    );
    provider1createdAt = (block as Block).timestamp;
  });

  describe("Owner", () => {
    it("should succeed in updating lock time succeed", async () => {
      const updatedLockTime = 2 * 24 * 60 * 60;
      await expect(dataRetrieve.updateLockTime(updatedLockTime)).not.to.be
        .reverted;

      const result = await dataRetrieve.lockTime();
      expect(result).to.equal(BigInt(updatedLockTime));
    });
  });

  describe("User", () => {
    it("should fail to update the lock time if it is not the owner", async () => {
      const updatedLockTime = 2 * 24 * 60 * 60;
      await expect(
        dataRetrieve.connect(user1).updateLockTime(updatedLockTime)
      ).to.be.revertedWithCustomError(
        DataRetrieve,
        "OwnableUnauthorizedAccount"
      );

      const result = await dataRetrieve.lockTime();
      expect(result).to.equal(BigInt(lockTime));
    });

    it("should deposit fund and update balance", async () => {
      const depositAmount = 1000;
      await dataRetrieve.depositFund({ value: depositAmount });

      const updatedBalance = await dataRetrieve.getUserBalance(ownerAddress);
      expect(updatedBalance).to.equal(
        BigInt(ownerInitialBalance + depositAmount)
      );
    });

    it("should get all users", async () => {
      const [addresses, balances] = (await dataRetrieve.getAllUsers()).map(
        (value) => [...value]
      );

      expect(addresses).to.have.members([ownerAddress, user1Address]);
      expect(balances).to.have.members([
        BigInt(ownerInitialBalance),
        BigInt(user1InitialBalance),
      ]);
    });
  });

  describe("Process refund", () => {
    let unlockTime: number, refundIndex: bigint;
    const refundAmount = 500;

    beforeEach(async () => {
      const res = await dataRetrieve.requestRefund(refundAmount);
      const receipt = await res.wait();
      const block = await ethers.provider.getBlock(
        (receipt as TransactionReceipt).blockNumber
      );
      unlockTime = (block as Block).timestamp + lockTime;
      refundIndex = (
        await dataRetrieve.queryFilter(dataRetrieve.filters.RefundRequested, -1)
      )[0].args[1];
    });

    it("should revert if called too soon", async () => {
      await expect(dataRetrieve.processRefund(refundIndex)).to.be.reverted;
    });

    it("should succeeded if the unlockTime has arrived and called", async () => {
      await time.increaseTo(unlockTime);

      await expect(dataRetrieve.processRefund(refundIndex)).not.to.be.reverted;
      const finalBalance = await dataRetrieve.getUserBalance(ownerAddress);
      expect(finalBalance).to.be.equal(
        BigInt(ownerInitialBalance - refundAmount)
      );
    });
  });

  describe("Service provider", () => {
    it("should get service", async () => {
      const [retrievedPrice, retrievedUrl, updatedAt] =
        await dataRetrieve.getService(provider1Address, provider1ServiceType);

      expect(retrievedPrice).to.equal(provider1Price);
      expect(retrievedUrl).to.equal(provider1Url);
      expect(updatedAt).to.not.equal(0);
    });

    it("should get all services", async () => {
      const [addresses, prices, urls, serviceTypes, updatedAts] = (
        await dataRetrieve.getAllServices()
      ).map((value) => [...value]);

      expect(addresses).to.have.members([provider1Address, provider2Address]);
      expect(prices).to.have.members([
        BigInt(provider1Price),
        BigInt(provider2Price),
      ]);
      expect(urls).to.have.members([provider1Url, provider2Url]);
      expect(serviceTypes).to.have.members([
        "0x" + Buffer.from(provider1ServiceType).toString("hex"),
        "0x" + Buffer.from(provider2ServiceType).toString("hex"),
      ]);
      expect(updatedAts[0]).to.not.equal(0);
      expect(updatedAts[1]).to.not.equal(0);
    });

    it("should update service", async () => {
      const modifiedPrice = 200;
      const modifiedPriceUrl = "https://example-modified.com";

      await expect(
        dataRetrieve
          .connect(provider1)
          .addOrUpdateService(
            provider1ServiceType,
            modifiedPrice,
            modifiedPriceUrl
          )
      )
        .to.emit(dataRetrieve, "ServiceUpdated")
        .withArgs(
          provider1Address,
          "0x" + Buffer.from(provider1ServiceType).toString("hex"),
          modifiedPrice,
          modifiedPriceUrl,
          anyValue
        );

      const [retrievedPrice, retrievedUrl, updatedAt] =
        await dataRetrieve.getService(provider1Address, provider1ServiceType);

      expect(retrievedPrice).to.equal(modifiedPrice);
      expect(retrievedUrl).to.equal(modifiedPriceUrl);
      expect(updatedAt).to.not.equal(0);
    });

    it("should remove service correctly", async function () {
      await expect(
        dataRetrieve.connect(provider1).removeService(provider1ServiceType)
      )
        .to.emit(dataRetrieve, "ServiceRemoved")
        .withArgs(
          provider1Address,
          "0x" + Buffer.from(provider1ServiceType).toString("hex")
        );

      const [addresses] = await dataRetrieve.getAllServices();
      expect(addresses.length).to.equal(1);
    });
  });

  describe("Settle fees", () => {
    let requestTrace: RequestTraceStruct[];
    let requestCreatedAt: number;
    const requestLength = 3;

    beforeEach(async () => {
      requestCreatedAt = provider1createdAt + 1;
      const requestsFromOwner = await Promise.all(
        Array.from({ length: requestLength }, (_, index) =>
          getSignedRequest(
            owner,
            ownerAddress,
            provider1Address,
            provider1ServiceType,
            requestCreatedAt,
            index + 1
          )
        )
      );

      const requestsFromUser1 = await Promise.all(
        Array.from({ length: requestLength }, (_, index) =>
          getSignedRequest(
            user1,
            user1Address,
            provider1Address,
            provider1ServiceType,
            requestCreatedAt,
            index + 1
          )
        )
      );

      requestTrace = [
        { requests: requestsFromOwner },
        { requests: requestsFromUser1 },
      ];
    });

    it("should succeed", async () => {
      await expect(dataRetrieve.connect(provider1).settleFees(requestTrace))
        .to.emit(dataRetrieve, "BalanceUpdated")
        .withArgs(
          ownerAddress,
          ownerInitialBalance - requestLength * provider1Price
        )
        .and.to.emit(dataRetrieve, "BalanceUpdated")
        .withArgs(
          user1Address,
          user1InitialBalance - requestLength * provider1Price
        );
    });

    it("should failed due to double spending", async () => {
      requestTrace[0].requests[1].nonce = requestTrace[0].requests[0].nonce;

      await expect(
        dataRetrieve.connect(provider1).settleFees(requestTrace)
      ).to.be.revertedWith("Nonce used");
    });

    it("should failed due to invalid recovered signature", async () => {
      requestTrace[0].requests[0].userAddress = user1Address;

      await expect(
        dataRetrieve.connect(provider1).settleFees(requestTrace)
      ).to.be.revertedWith("Invalid request");
    });

    it("should failed due to changes in the service after the request was made", async () => {
      const modifiedPrice = 10000;
      await dataRetrieve
        .connect(provider1)
        .addOrUpdateService(provider1ServiceType, modifiedPrice, provider1Url);

      await expect(
        dataRetrieve.connect(provider1).settleFees(requestTrace)
      ).to.be.revertedWith("Service updated");
    });

    it("should failed due to insufficient balance", async () => {
      const excessiveRequestLength = user1InitialBalance / provider1Price + 1;
      const excessiveRequests = await Promise.all(
        Array.from({ length: excessiveRequestLength }, (_, index) =>
          getSignedRequest(
            user1,
            user1Address,
            provider1Address,
            provider1ServiceType,
            requestCreatedAt,
            index + 1
          )
        )
      );
      const excessiveRequestTrace = [{ requests: excessiveRequests }];

      await expect(
        dataRetrieve.connect(provider1).settleFees(excessiveRequestTrace)
      ).to.be.revertedWith("Insufficient balance");
    });
  });
});

async function getSignedRequest(
  signer: HardhatEthersSigner,
  user: string,
  provider: string,
  serviceType: Uint8Array,
  createAt: number,
  nonce: number
): Promise<RequestStruct> {
  const hash = ethers.solidityPackedKeccak256(
    ["address", "address", "bytes32", "uint256", "uint256"],
    [provider, user, serviceType, nonce, createAt]
  );

  const sig = await signer.signMessage(ethers.toBeArray(hash));

  return {
    userAddress: user,
    nonce: nonce,
    serviceType: serviceType,
    createdAt: createAt,
    signature: sig,
  };
}
