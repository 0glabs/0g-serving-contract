# Settlement

The settle function can be divided into two main logical parts:

1. Verification
2. Transfer

## Overview

1. The essence of the settlement voucher is a request sent by the user to the provider. Each request contains fee information, signed by the user, and verified and recognized by the provider.
2. To save gas and time, the provider uses zk (Zero-Knowledge) to produce a settlement voucher for multiple requests. This voucher includes:
    1. **proof**: The proof generated by the zk circuit. This proof shows that the provider has verified that the information in the requests matches the information in the public input, satisfying certain inherent relationships (details in [Zk Proof on the Provider Side](#zk-proof-on-the-provider-side)).
    2. **public input**: Information visible to the verifier, representing the constraints in the proof process. It is also the input information needed by the contract to calculate the fee.
3. As the verifier, the contract verifies that the proof and public input provided by the provider meet the agreed logic. It then calculates the fee based on the information in the public input and performs the transfer.

### Verification

The verification process can be divided into three parts:

1. [Zk Proof on the Provider Side](#zk-proof-on-the-provider-side): Performed by the zk component deployed by the provider, outputting proof and public input.
2. [Verification of proof and public input on the contract](#verification-of-proof-and-public-input-on-the-contract).
3. [Additional verification](#additional-verification): Further comparing the public input with specific parameters recorded on the contract to confirm the legality of the public input.

### Zk Proof on the Provider Side

1. Each request contains the following information: nonce, fee, user address, provider address, and signature. These elements represent:

    1. **nonce**: Used to mark the request's uniqueness.
    2. **fee**: The fee for that request.
    3. **user address**: The user's address.
    4. **provider address**: The provider's address.
    5. **signature**: The signature of the above information, using the private key corresponding to the public key in the public input. Each user has a fixed key pair.

2. The provider groups the requests by user and then further groups each user's requests into fixed-size chunks. Requests fewer than the size are padded with zero values. The hardcoded size in the circuit is currently 40. Each such group is referred to as a chunk. For example, if a provider has 90 requests from user A, 50 from user B, and 70 from user C, they will be divided into six groups [40, 40, 10, 40, 10, 40, 30]. Each group will generate a proof and public input.

    1. **proof**: A multi-dimensional array representing the proof result. The specific values do not carry inherent significance.

    2. **public input**: Contains the following information: user address, provider address, initial nonce, final nonce, total fee, and signer public key. These represent:

        1. user address: The user's address.
        2. provider address: The provider's address.
        3. initial nonce: The nonce of the first request in the 40 requests.
        4. final nonce: The nonce of the last request in the 40 requests.
        5. total fee: The total fee of the 40 requests.
        6. signer public key: The public key used to verify each request's signature.

    3. Constraints logic of the proof:

        1. The signer public key in the public input parses each signature to obtain the request's meta information: nonce, fee, user address, and provider address, and verifies it matches the actual request information.
            - This converts the verification of each request's meta information into the verification of the signer's public key in the public input.
        2. The total fee of the 40 requests is equal to the fee in the public input.
            - This converts the verification of the total request fee into the verification of the public input's fee.
        3. The nonces of the 40 requests are sequentially increasing, with the smallest being the initial nonce and the largest being the final nonce in the public input.
            - After each successful settlement, the contract records the final nonce. Therefore, the smallest recorded nonce less than the public input's initial nonce shows that all requests in the settlement fulfill the nonce increasing sequence and are greater than previous requests, preventing double-spend attacks.

### Verification of Proof and Public Input on the Contract

1. The proof generated in the previous step will be combined into the following input structure:

    ```golang
     verifierInput := contract.VerifierInput{
         InProof:     []*big.Int{},
         ProofInputs: []*big.Int{},
         NumChunks:   big.NewInt(0),
         SegmentSize: []*big.Int{},
     }
    ```

    1. **InProof**: Represents the proof array, combined from each chunk's proof.
    2. **ProofInputs**: Represents the public input array, combined from each chunk's public input.
    3. **NumChunks**: The number of chunks.
    4. **SegmentSize**: Though chunks from different users' requests can be intermixed in the zk circuit logic, it is required in subsequent verification that chunks from different users are not interspersed. Each element in SegmentSize represents the length of each segment from the same user in ProofInputs.

2. The contract will batch-verify each proof in verifierInput.

### Additional Verification

Break down ProofInputs into segments according to SegmentSize, where each segment corresponds to one user's chunks, and verify each:

1. Verification for the first chunk:

    1. Based on the user address and provider address in ProofInputs, find the account information on the contract.
    2. Verify the account's signer matches the signer public key field in ProofInputs.
    3. Verify the nonce in the account is less than the initial nonce in ProofInputs.
    4. Record the chunk's fee.

2. Verification for subsequent chunks in the ProofInputs:

    1. Each user address and provider address in the ProofInputs should be consistent with the ones in the first chunk.
    2. The final nonce in each chunk should be less than the initial nonce of the next chunk.
    3. Record the chunk's fee.

3. Calculate the total fee for all chunks. If the account's balance is sufficient, proceed with the [transfer](#transfer).

## Transfer

1. Each account has two funds pools: the "non-refunded funds pool" and the "refunded funds pool."
2. The "refunded funds pool" contains funds that users have requested to refund but the lock time (lock time) has not been reached, so it has not yet been returned to the users.
3. The "refunded funds pool" consists of individual refunds. Each refund has its amount and application time.
4. When transferring, the system first deducts from the "non-refunded funds pool" and then proceeds in reverse chronological order to deduct from each refund in the "refunded funds pool" as needed.
