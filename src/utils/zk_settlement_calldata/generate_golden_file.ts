/**
   generate_golden_file.ts generates inputs for `Settle fees` section in serving.spec.ts:
   it constructs input for each test case in advance and transforms these
   constructed inputs into inputs for the settleFees function in the contract
   via the prover broker (https://github.com/0glabs/zk-settlement).
 
   Three accounts are involved in the test, including owner, user1 and provider1. 
   Owner and user1 are users generating signed requests, where owner is the deployer of the contract, 
   using as an ordinary user here.
   Provider1 receives requests and converts them to calldata for settlement in contract. 

   The addresses of accounts above are known beforehand and the corresponding private keys 
   are defined in the hardhat.config.ts file. The addresses as shown below:

   owner: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
   user1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
   provider1: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

   The working process of generate_golden_file.ts can be described as a sequence of calls to prover broker,
   whose host is hardcoded as `http://localhost:3000`. Thus, make sure a prover broker is running before using 
   this script. A typical process describing the generation of the inputs for a successful `Settle fees` 
   is like this, where step 1-3 represent calls to the prover broker: 

   1. Owner/user1 generates private public key pairs for signing requests
   2. Owner/user1 generates a signature using requests sent to provider1
   3. Provider1 generates calldata using requests sent from owner/user1
   4. Provider1 combine the calldata (flatten and concatenate field inProof and field proofInput) into a single calldata for batch verification
*/

import { writeFileSync } from "fs";
import fetch from "node-fetch";
import { join } from "path";
import { calculatePedersenHash } from "../utils";

const host = "http://localhost:3000";

// requestLength defined in the circuit of prover
const requestLength = 4;

interface Request {
    nonce: string;
    reqFee: string;
    userAddress: string;
    providerAddress: string;
    requestHash: Uint8Array;
    resFee: string;
}

interface KeyPair {
    privkey: string[];
    pubkey: string[];
}

interface CallData {
    pA: string[];
    pB: string[][];
    pC: string[];
    pubInputs: string[];
}

interface Signature {
    reqSigs: string[][];
    resSigs: string[][];
}

type NestedStringArray = string | (string | NestedStringArray)[];

function flattenArray(arr: NestedStringArray[]): string[] {
    return arr.reduce((acc: string[], val: NestedStringArray) => {
        return acc.concat(Array.isArray(val) ? flattenArray(val) : val);
    }, []);
}

const generateKeyPair = async (): Promise<KeyPair> => {
    const response = await fetch(host + "/sign-keypair");
    const data = await response.json();
    return data;
};

function toJSONable(value: unknown) {
    return value instanceof Uint8Array ? Array.from(value) : value;
}

const generateSignatures = async (requests: Request[], reqPrivkey: string[], resPrivkey: string[]): Promise<Signature> => {
    const response = await fetch(host + "/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests, reqPrivkey, resPrivkey }, (_, val) => toJSONable(val)),
    });
    const data = await response.json();
    return data.signatures;
};

const generateCalldata = async (
    requests: Request[],
    l: number,
    reqPubkey: string[],
    reqSignatures: string[][],
    resPubkey: string[] = [],
    resSignatures: string[][] = []
): Promise<CallData> => {
    const proofInput = { requests, l, reqPubkey, reqSignatures, resPubkey, resSignatures };
    const calldataResponse = await fetch(host + "/solidity-calldata-combined", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proofInput, (_, val) => toJSONable(val)),
    });
    const calldataData = await calldataResponse.json();
    return calldataData;
};

const generateSucceed = async (reqPrivkey: string[], reqPubkey: string[], resPrivkey: string[], resPubkey: string[]): Promise<string> => {
    const ownerRequests: Request[] = [
        {
            nonce: "17326143486140001",
            reqFee: "10",
            userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            providerAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
            requestHash: await calculatePedersenHash(BigInt("17326143486140001"), BigInt("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"), BigInt("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")),
            resFee: "0",
        },
        {
            nonce: "17326143486140002",
            reqFee: "10",
            userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            providerAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
            requestHash: await calculatePedersenHash(BigInt("17326143486140002"), BigInt("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"), BigInt("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")),
            resFee: "0",
        },
    ];
    const user1Requests: Request[] = [
        {
            nonce: "17326143486140001",
            reqFee: "10",
            userAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
            providerAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
            requestHash: await calculatePedersenHash(BigInt("17326143486140001"), BigInt("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"), BigInt("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")),
            resFee: "0",
        },
        {
            nonce: "17326143486140002",
            reqFee: "10",
            userAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
            providerAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
            requestHash: await calculatePedersenHash(BigInt("17326143486140002"), BigInt("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"), BigInt("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")),
            resFee: "0",
        },
    ];
    const ownerSignatures = await generateSignatures(ownerRequests, reqPrivkey, resPrivkey);
    const ownerCalldata = await generateCalldata(ownerRequests, requestLength, reqPubkey, ownerSignatures.reqSigs, resPubkey, ownerSignatures.resSigs);
    const user1Signatures = await generateSignatures(user1Requests, reqPrivkey, resPrivkey);
    const user1Calldata = await generateCalldata(user1Requests, requestLength, reqPubkey, user1Signatures.reqSigs, resPubkey, user1Signatures.resSigs);

    const inProof = flattenArray([
        ownerCalldata.pA,
        ownerCalldata.pB,
        ownerCalldata.pC,
        user1Calldata.pA,
        user1Calldata.pB,
        user1Calldata.pC,
    ])
        .map((item) => `    BigInt(\`${item}\`),`)
        .join("\n");

    const proofInputs = flattenArray([ownerCalldata.pubInputs, user1Calldata.pubInputs])
        .map((item) => `    BigInt(\`${item}\`),`)
        .join("\n");

    const fileContent = `/**
 * This is an autogenerated file. Do not edit this file manually.
 *
 * succeed.ts gives inputs for the \`succeed case\` in the \`Settle fees\` section in serving.spec.ts
 */

export const succeedInProof = [
${inProof}
];

export const succeedProofInputs = [
${proofInputs}
];

/**
 * The fee is calculated by summing all fees in the requests: 10 + 10 = 20
 */
export const succeedFee = 20;
`;

    return fileContent;
};

const generateDoubleSpending = async (reqPrivkey: string[], reqPubkey: string[], resPrivkey: string[], resPubkey: string[]): Promise<string> => {
    const initRequests: Request[] = [
        {
            nonce: "17326143486140001",
            reqFee: "10",
            userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            providerAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
            requestHash: await calculatePedersenHash(BigInt("17326143486140001"), BigInt("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"), BigInt("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")),
            resFee: "10",
        },
        {
            nonce: "17326143486140002",
            reqFee: "10",
            userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            providerAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
            requestHash: await calculatePedersenHash(BigInt("17326143486140002"), BigInt("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"), BigInt("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")),
            resFee: "10",
        },
    ];
    const overlappedRequests: Request[] = [
        {
            nonce: "17326143486140039",
            reqFee: "10",
            userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            providerAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
            requestHash: await calculatePedersenHash(BigInt("17326143486140039"), BigInt("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"), BigInt("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")),
            resFee: "10",
        },
        {
            nonce: "17326143486140040",
            reqFee: "10",
            userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            providerAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
            requestHash: await calculatePedersenHash(BigInt("17326143486140040"), BigInt("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"), BigInt("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")),
            resFee: "10",
        },
    ];
    const initSignatures = await generateSignatures(initRequests, reqPrivkey, resPrivkey);
    const initCalldata = await generateCalldata(initRequests, requestLength, reqPubkey, initSignatures.reqSigs, resPubkey, initSignatures.resSigs);
    const overlappedSignatures = await generateSignatures(overlappedRequests, reqPrivkey, resPrivkey);
    const overlappedCalldata = await generateCalldata(overlappedRequests, requestLength, reqPubkey, overlappedSignatures.reqSigs, resPubkey, overlappedSignatures.resSigs);

    const inProof = flattenArray([
        initCalldata.pA,
        initCalldata.pB,
        initCalldata.pC,
        overlappedCalldata.pA,
        overlappedCalldata.pB,
        overlappedCalldata.pC,
    ])
        .map((item) => `    BigInt(\`${item}\`),`)
        .join("\n");

    const proofInputs = flattenArray([initCalldata.pubInputs, overlappedCalldata.pubInputs])
        .map((item) => `    BigInt(\`${item}\`),`)
        .join("\n");

    const fileContent = `/**
 * This is an autogenerated file. Do not edit this file manually.
 *
 * double_spending.ts gives inputs for the \`double spending case\`
 * in the \`Settle fees\` section in serving.spec.ts
 */

export const doubleSpendingInProof = [
${inProof}
];

export const doubleSpendingProofInputs = [
${proofInputs}
];
`;

    return fileContent;
};

const generateInsufficientBalance = async (reqPrivkey: string[], reqPubkey: string[], resPrivkey: string[], resPubkey: string[]): Promise<string> => {
    const requests: Request[] = [
        {
            nonce: "17326143486140001",
            reqFee: "600",
            userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            providerAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
            requestHash: await calculatePedersenHash(BigInt("17326143486140001"), BigInt("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"), BigInt("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")),
            resFee: "0",
        },
        {
            nonce: "17326143486140002",
            reqFee: "600",
            userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            providerAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
            requestHash: await calculatePedersenHash(BigInt("17326143486140002"), BigInt("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"), BigInt("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")),
            resFee: "0",
        },
    ];

    const signatures = await generateSignatures(requests, reqPrivkey, resPrivkey);
    const calldata = await generateCalldata(requests, requestLength, reqPubkey, signatures.reqSigs, resPubkey, signatures.resSigs);

    const inProof = flattenArray([calldata.pA, calldata.pB, calldata.pC])
        .map((item) => `    BigInt(\`${item}\`),`)
        .join("\n");

    const proofInputs = flattenArray(calldata.pubInputs)
        .map((item) => `    BigInt(\`${item}\`),`)
        .join("\n");

    const fileContent = `/**
 * This is an autogenerated file. Do not edit this file manually.
 *
 * insufficient_balance.ts gives inputs for the \`insufficient balance case\`
 * in the \`Settle fees\` section in serving.spec.ts
 */

export const insufficientBalanceInProof = [
${inProof}
];

export const insufficientBalanceProofInputs = [
${proofInputs}
];
`;

    return fileContent;
};

const generateKeyPairContent = (privkey: string[], pubkey: string[]): string => {
    const privkeyContent = privkey.map((item) => `    BigInt(\`${item}\`),`).join("\n");
    const pubkeyContent = pubkey.map((item) => `    BigInt(\`${item}\`),`).join("\n");

    const fileContent = `/**
 * This is an autogenerated file. Do not edit this file manually.
 *
 * key_pair.ts gives private and public key for signing the requests 
 * in all test in the \`Settle fees\` section in serving.spec.ts.
 */

import { BigNumberish } from "ethers";

export const privateKey: [BigNumberish, BigNumberish] = [
${privkeyContent}
];

export const publicKey: [BigNumberish, BigNumberish] = [
${pubkeyContent}
];
`;
    return fileContent;
};

const generateGolden = async () => {
    const reqKey = await generateKeyPair();
    const resKey = await generateKeyPair();
    let fileContent = await generateKeyPairContent(reqKey.privkey, reqKey.pubkey);
    let filePath = join(__dirname, "/golden/key_pair_req.ts");
    writeFileSync(filePath, fileContent, "utf8");
    fileContent = await generateKeyPairContent(resKey.privkey, resKey.pubkey);
    filePath = join(__dirname, "/golden/key_pair_res.ts");
    writeFileSync(filePath, fileContent, "utf8");

    fileContent = await generateSucceed(reqKey.privkey, reqKey.pubkey, resKey.privkey, resKey.pubkey);
    filePath = join(__dirname, "/golden/succeed.ts");
    writeFileSync(filePath, fileContent, "utf8");

    fileContent = await generateDoubleSpending(reqKey.privkey, reqKey.pubkey, resKey.privkey, resKey.pubkey);
    filePath = join(__dirname, "/golden/double_spending.ts");
    writeFileSync(filePath, fileContent, "utf8");

    fileContent = await generateInsufficientBalance(reqKey.privkey, reqKey.pubkey, resKey.privkey, resKey.pubkey);
    filePath = join(__dirname, "/golden/insufficient_balance.ts");
    writeFileSync(filePath, fileContent, "utf8");
};

generateGolden();
