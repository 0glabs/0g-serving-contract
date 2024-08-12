/**
 * double_spending.ts provides input for `double spending` case of the `Settle fees` section in serving.spec.ts:
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
            "fee": "10",
            "userAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "providerAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
          },
          {
            "nonce": 2,
            "fee": "10",
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
            33, 187, 155, 113, 83, 115, 69, 229, 177, 238, 235, 227, 182, 104, 247,
            151, 161, 71, 8, 159, 209, 81, 47, 82, 171, 161, 52, 202, 211, 25, 101,
            165, 158, 86, 103, 142, 120, 120, 130, 151, 3, 134, 209, 180, 182, 177,
            172, 2, 45, 215, 141, 174, 115, 12, 170, 190, 69, 216, 76, 75, 232, 209,
            19, 2
          ],
          [
            33, 187, 155, 113, 83, 115, 69, 229, 177, 238, 235, 227, 182, 104, 247,
            151, 161, 71, 8, 159, 209, 81, 47, 82, 171, 161, 52, 202, 211, 25, 101,
            165, 158, 86, 103, 142, 120, 120, 130, 151, 3, 134, 209, 180, 182, 177,
            172, 2, 45, 215, 141, 174, 115, 12, 170, 190, 69, 216, 76, 75, 232, 209,
            19, 2
          ]
        ]
      }
      ```
  
   4. Provider1 generates Solidity Calldata using requests sent from owner:
  
     curl -X POST -H "Content-Type: application/json" -d '{
        "requests": [
           {
            "nonce": 1,
            "fee": "10",
            "userAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "providerAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
           },
           {
             "nonce": 2,
             "fee": "10",
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
            33, 187, 155, 113, 83, 115, 69, 229, 177, 238, 235, 227, 182, 104, 247,
            151, 161, 71, 8, 159, 209, 81, 47, 82, 171, 161, 52, 202, 211, 25, 101,
            165, 158, 86, 103, 142, 120, 120, 130, 151, 3, 134, 209, 180, 182, 177,
            172, 2, 45, 215, 141, 174, 115, 12, 170, 190, 69, 216, 76, 75, 232, 209,
            19, 2
          ],
          [
            33, 187, 155, 113, 83, 115, 69, 229, 177, 238, 235, 227, 182, 104, 247,
            151, 161, 71, 8, 159, 209, 81, 47, 82, 171, 161, 52, 202, 211, 25, 101,
            165, 158, 86, 103, 142, 120, 120, 130, 151, 3, 134, 209, 180, 182, 177,
            172, 2, 45, 215, 141, 174, 115, 12, 170, 190, 69, 216, 76, 75, 232, 209,
            19, 2
          ]
        ]
      }' http://localhost:3000/proof-input > proof_input_for_owner.json && 
      curl -X POST -H "Content-Type: application/json" -d @proof_input_for_owner.json http://localhost:3000/solidity-calldata

      ```output
      ["0x16b679d892a0e41e3e5de722a06d78fc453a0272539b8727e1312114dcf63ba2", "0x02a3a4d661403a9de1fd564c8ece25ec3b114ae0d8cc44ee9030828508c8e97c"],[["0x07a9b824a2ed8477e38d302e99f3279a659fd32db0ab85472f6dff8c2e69f841", "0x006501a16fe43739086ce12b5a128b71e2e320204063de3efcb71e538a026925"],["0x1ceb1b1697d4624c793592c11d747f49d992c6388ba04a48821518503b7efd47", "0x1b9ab9c8a46ff189d92fc11d020f18f41b6be42f5790a936cc93116ba66b381e"]],["0x05bff5765ed5da80d183e262c0a04cae7256708783df7ce3e1ce5873236ef740", "0x292de6302473a4596f427d678921558b9f54dcaba0d7d233ff082648c659b806"],["0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266","0x0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc","0x0000000000000000000000000000000000000000000000000000000000000001","0x0000000000000000000000000000000000000000000000000000000000000028","0x0000000000000000000000000000000000000000000000000000000000000014","0x00000000000000000000000000000000f53c7ac01e2dddc0c5035ba25a71d602","0x00000000000000000000000000000000a1e508d7148eb28b1bbafc2b56b6d6c9"]
      ```
   5. Repeat 2-4 to contract a calldata using overlapped requests (for the calldata generated above, the requests in chunk will be replenished to 40):         
         "requests": [
           {
            "nonce": 39,
            "fee": "10",
            "userAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "providerAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
           },
           {
             "nonce": 40,
             "fee": "10",
             "userAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
             "providerAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
           }
         ],

        ```output
        ["0x1931f33424b1bfa1030bddc7b6b8df87e7330d754ec821743c193a8bc9f56c2d", "0x1b103a4a370cc12a8f52c8026df67d391748bf1dc78ce5886b4b8278f5e2105a"],[["0x056a472319a0e715265d1c177233f438f0448ffdadcfdce2dbd74fd5a8f82e71", "0x00028368f6289328efd71759f19f29251e4d3404a428b16ae6407a8ebcaa040e"],["0x136f33ffebdee06f10a33153d53bb04763ba91f71c79d97ef7d0fe6e019e9c3c", "0x2ae452f921b974ea2839989af71195d603cab22d38ff088775b6d6bc323a5408"]],["0x1710c6dd13cd7d875eba9f954af0d7f1646e971622b99cd11efc74492508c4cc", "0x2f093b7b8656052c2cf1c54c84370579b0f0c7881129fb8d33ba22f093468809"],["0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266","0x0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc","0x0000000000000000000000000000000000000000000000000000000000000027","0x000000000000000000000000000000000000000000000000000000000000004e","0x0000000000000000000000000000000000000000000000000000000000000014","0x00000000000000000000000000000000f53c7ac01e2dddc0c5035ba25a71d602","0x00000000000000000000000000000000a1e508d7148eb28b1bbafc2b56b6d6c9"]
        ```

   6. Combine the calldata (flatten and concatenate inProof and proofInput) into a single calldata for batch verification

*/

export const doubleSpendingInProof = [
    BigInt("0x16b679d892a0e41e3e5de722a06d78fc453a0272539b8727e1312114dcf63ba2"),
    BigInt("0x02a3a4d661403a9de1fd564c8ece25ec3b114ae0d8cc44ee9030828508c8e97c"),
    BigInt("0x07a9b824a2ed8477e38d302e99f3279a659fd32db0ab85472f6dff8c2e69f841"),
    BigInt("0x006501a16fe43739086ce12b5a128b71e2e320204063de3efcb71e538a026925"),
    BigInt("0x1ceb1b1697d4624c793592c11d747f49d992c6388ba04a48821518503b7efd47"),
    BigInt("0x1b9ab9c8a46ff189d92fc11d020f18f41b6be42f5790a936cc93116ba66b381e"),
    BigInt("0x05bff5765ed5da80d183e262c0a04cae7256708783df7ce3e1ce5873236ef740"),
    BigInt("0x292de6302473a4596f427d678921558b9f54dcaba0d7d233ff082648c659b806"),
    BigInt("0x1931f33424b1bfa1030bddc7b6b8df87e7330d754ec821743c193a8bc9f56c2d"),
    BigInt("0x1b103a4a370cc12a8f52c8026df67d391748bf1dc78ce5886b4b8278f5e2105a"),
    BigInt("0x056a472319a0e715265d1c177233f438f0448ffdadcfdce2dbd74fd5a8f82e71"),
    BigInt("0x00028368f6289328efd71759f19f29251e4d3404a428b16ae6407a8ebcaa040e"),
    BigInt("0x136f33ffebdee06f10a33153d53bb04763ba91f71c79d97ef7d0fe6e019e9c3c"),
    BigInt("0x2ae452f921b974ea2839989af71195d603cab22d38ff088775b6d6bc323a5408"),
    BigInt("0x1710c6dd13cd7d875eba9f954af0d7f1646e971622b99cd11efc74492508c4cc"),
    BigInt("0x2f093b7b8656052c2cf1c54c84370579b0f0c7881129fb8d33ba22f093468809"),
];

export const doubleSpendingProofInputs = [
    BigInt("0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266"),
    BigInt("0x0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc"),
    BigInt("0x0000000000000000000000000000000000000000000000000000000000000001"),
    BigInt("0x0000000000000000000000000000000000000000000000000000000000000028"),
    BigInt("0x0000000000000000000000000000000000000000000000000000000000000014"),
    BigInt("0x00000000000000000000000000000000f53c7ac01e2dddc0c5035ba25a71d602"),
    BigInt("0x00000000000000000000000000000000a1e508d7148eb28b1bbafc2b56b6d6c9"),
    BigInt("0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266"),
    BigInt("0x0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc"),
    BigInt("0x0000000000000000000000000000000000000000000000000000000000000027"),
    BigInt("0x000000000000000000000000000000000000000000000000000000000000004e"),
    BigInt("0x0000000000000000000000000000000000000000000000000000000000000014"),
    BigInt("0x00000000000000000000000000000000f53c7ac01e2dddc0c5035ba25a71d602"),
    BigInt("0x00000000000000000000000000000000a1e508d7148eb28b1bbafc2b56b6d6c9"),
];
