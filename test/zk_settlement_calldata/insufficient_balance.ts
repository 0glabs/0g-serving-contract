/**
 * insufficient balance.ts provides input for `Insufficient balance` case of the `Settle fees` section in serving.spec.ts:
 * it constructs input for each test case in advance and transforms these
 * constructed inputs into inputs for the settleFees function in the contract
 * via the prover agent (https://github.com/0glabs/zk-settlement).
 *
 * The addresses of related accounts in the test are known beforehand and the corresponding
 * private keys are defined in the hardhat.config.ts file. The addresses as shown below:
 *
 * owner (the deployer of the contract, using as an ordinary user in this test case): 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 * provider1: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
 */

/**
   1. Owner generate private public key pairs for signing requests:
  
      curl http://localhost:3000/sign-keypair
  
      ```output
      {
      "privkey": [
       "0x6b6b3cee701594b5a836c9480d3f6854",
       "0x144592ba51027965ee193f5c4517f4ca"
      ],
      "pubkey": [
        "0xf53c7ac01e2dddc0c5035ba25a71d602",
        "0xa1e508d7148eb28b1bbafc2b56b6d6c9"
      ]
      ```
 
   2. Owner generates a signature using requests sent to provider1
  
      curl -X POST -H "Content-Type: application/json" -d '{
        "requests": [
          {
            "nonce": 1,
            "fee": "600",
            "userAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "providerAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
          },
          {
            "nonce": 2,
            "fee": "600",
            "userAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "providerAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
          }
        ],
        "privkey": [
          "0x6b6b3cee701594b5a836c9480d3f6854",
          "0x144592ba51027965ee193f5c4517f4ca"
        ]
      }' http://localhost:3000/signature
  
  
      ```output
      {
        "signatures": [
          [
            100, 148, 156, 148, 32, 105, 150, 100, 163, 132, 187, 185, 197, 4, 85,
            196, 192, 92, 46, 187, 97, 236, 146, 34, 217, 6, 90, 54, 20, 162, 58, 134,
            90, 227, 130, 222, 97, 223, 56, 203, 255, 183, 225, 45, 88, 225, 143, 250,
            46, 0, 149, 115, 174, 130, 179, 210, 83, 31, 233, 141, 120, 27, 230, 4
          ],
          [
            43, 144, 116, 127, 23, 168, 98, 16, 173, 206, 153, 168, 49, 3, 101, 88,
            85, 140, 35, 126, 228, 171, 40, 239, 100, 232, 242, 152, 201, 4, 246, 39,
            38, 22, 252, 99, 126, 151, 47, 207, 147, 154, 5, 25, 177, 22, 161, 218,
            95, 105, 158, 232, 118, 245, 146, 176, 24, 66, 2, 18, 25, 133, 113, 0
          ]
        ]
      }
      ```
  
   4. Provider1 generates Solidity Calldata using requests sent from owner:
  
     curl -X POST -H "Content-Type: application/json" -d '{
        "requests": [
           {
            "nonce": 1,
            "fee": "600",
            "userAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "providerAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
           },
           {
             "nonce": 2,
             "fee": "600",
             "userAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
             "providerAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
           }
         ],
        "l": 40,
        "pubkey": [
          "0xf53c7ac01e2dddc0c5035ba25a71d602",
          "0xa1e508d7148eb28b1bbafc2b56b6d6c9"
        ],
        "signatures": [
          [
            100, 148, 156, 148, 32, 105, 150, 100, 163, 132, 187, 185, 197, 4, 85,
            196, 192, 92, 46, 187, 97, 236, 146, 34, 217, 6, 90, 54, 20, 162, 58, 134,
            90, 227, 130, 222, 97, 223, 56, 203, 255, 183, 225, 45, 88, 225, 143, 250,
            46, 0, 149, 115, 174, 130, 179, 210, 83, 31, 233, 141, 120, 27, 230, 4
          ],
          [
            43, 144, 116, 127, 23, 168, 98, 16, 173, 206, 153, 168, 49, 3, 101, 88,
            85, 140, 35, 126, 228, 171, 40, 239, 100, 232, 242, 152, 201, 4, 246, 39,
            38, 22, 252, 99, 126, 151, 47, 207, 147, 154, 5, 25, 177, 22, 161, 218,
            95, 105, 158, 232, 118, 245, 146, 176, 24, 66, 2, 18, 25, 133, 113, 0
          ]
        ]
      }' http://localhost:3000/proof-input > proof_input_for_owner.json && 
      curl -X POST -H "Content-Type: application/json" -d @proof_input_for_owner.json http://localhost:3000/solidity-calldata

      ```output
      ["0x2c172ac147c90b81afb7907c7a39dca785a6fc2fbbc74c2c226f7383712265f7", "0x03cf6e0896ac7459795d73e6c18d0819738e00e293ffca40f3b2580b4e7f7dd2"],[["0x118d4f84ac2ff4f91ce218501a7055bffa6d8832eb43ff05bc8afbea742fd610", "0x0c44df29fd6d43a5a1f30421ba51c86a4b194ee6db85c23a76a6926a956f0789"],["0x2b249296ed8b2930e9bb900444bb92b3b9cde3a13a46df40e31cbf9c1bb571c4", "0x15da028609e7c646dbca2696fb2480fb95ed3fe0b74d33b531b0b06aefe103ea"]],["0x1cdc971aa5c4f3698a4951687b5cfa050172da73215de3bd5f50c7d4fd636f40", "0x0f0f189adfbea39d94e9329917f708dcab920bff74b2d78b1390dad319a67513"],["0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266","0x0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc","0x0000000000000000000000000000000000000000000000000000000000000001","0x0000000000000000000000000000000000000000000000000000000000000028","0x00000000000000000000000000000000000000000000000000000000000004b0","0x00000000000000000000000000000000f53c7ac01e2dddc0c5035ba25a71d602","0x00000000000000000000000000000000a1e508d7148eb28b1bbafc2b56b6d6c9"]
      ```
   
   6. Reorganize the calldata (flatten and concatenate inProof and proofInput) into a single calldata for batch verification

*/

export const insufficientBalanceInProof = [
    BigInt("0x2c172ac147c90b81afb7907c7a39dca785a6fc2fbbc74c2c226f7383712265f7"),
    BigInt("0x03cf6e0896ac7459795d73e6c18d0819738e00e293ffca40f3b2580b4e7f7dd2"),
    BigInt("0x118d4f84ac2ff4f91ce218501a7055bffa6d8832eb43ff05bc8afbea742fd610"),
    BigInt("0x0c44df29fd6d43a5a1f30421ba51c86a4b194ee6db85c23a76a6926a956f0789"),
    BigInt("0x2b249296ed8b2930e9bb900444bb92b3b9cde3a13a46df40e31cbf9c1bb571c4"),
    BigInt("0x15da028609e7c646dbca2696fb2480fb95ed3fe0b74d33b531b0b06aefe103ea"),
    BigInt("0x1cdc971aa5c4f3698a4951687b5cfa050172da73215de3bd5f50c7d4fd636f40"),
    BigInt("0x0f0f189adfbea39d94e9329917f708dcab920bff74b2d78b1390dad319a67513"),
];

export const insufficientBalanceProofInputs = [
    BigInt("0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266"),
    BigInt("0x0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc"),
    BigInt("0x0000000000000000000000000000000000000000000000000000000000000001"),
    BigInt("0x0000000000000000000000000000000000000000000000000000000000000028"),
    BigInt("0x00000000000000000000000000000000000000000000000000000000000004b0"),
    BigInt("0x00000000000000000000000000000000f53c7ac01e2dddc0c5035ba25a71d602"),
    BigInt("0x00000000000000000000000000000000a1e508d7148eb28b1bbafc2b56b6d6c9"),
];
