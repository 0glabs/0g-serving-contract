import { BigNumberish } from "ethers";

/**
 * succeed.ts provides input for the `succeed case` in the `Settle fees` section in serving.spec.ts:
 * it constructs input for each test case in advance and transforms these
 * constructed inputs into inputs for the settleFees function in the contract
 * via the prover agent (https://github.com/0glabs/zk-settlement).
 *
 * The addresses of related accounts in the test are known beforehand and the corresponding
 * private keys are defined in the hardhat.config.ts file. The addresses as shown below:
 *
 * owner (the deployer of the contract, using as an ordinary user in this test case): 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 * user1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
 * provider1: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
 */

/**
   1. Owner and user1 generate private public key pairs for signing requests:
  
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
 */

export const privateKey: [BigNumberish, BigNumberish] = [
    BigInt("0x6b6b3cee701594b5a836c9480d3f6854"),
    BigInt("0x144592ba51027965ee193f5c4517f4ca"),
];

export const publicKey: [BigNumberish, BigNumberish] = [
    BigInt("0xf53c7ac01e2dddc0c5035ba25a71d602"),
    BigInt("0xa1e508d7148eb28b1bbafc2b56b6d6c9"),
];

/**
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
            164, 208, 55, 126, 21, 126, 83, 47, 91, 0, 154, 123, 47, 255, 202, 51,
            156, 140, 223, 29, 203, 98, 245, 81, 35, 100, 247, 193, 70, 147, 154, 28,
            13, 169, 34, 80, 192, 30, 252, 124, 42, 254, 142, 238, 113, 65, 232, 143,
            195, 84, 101, 103, 11, 207, 144, 28, 181, 212, 68, 106, 195, 159, 207, 5
          ]
        ]
      }
      ```
  
   3. User1 generates a signature using requests sent to provider1
  
      curl -X POST -H "Content-Type: application/json" -d '{
       "requests": [
         {
           "nonce": 1,
           "fee": "10",
           "userAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
           "providerAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
         },
         {
           "nonce": 2,
           "fee": "10",
           "userAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
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
            196, 202, 55, 243, 25, 48, 184, 86, 114, 156, 45, 140, 84, 146, 121, 144,
            242, 234, 217, 249, 210, 19, 8, 7, 57, 216, 72, 74, 156, 221, 80, 138, 52,
            4, 181, 122, 231, 252, 181, 38, 79, 26, 101, 124, 191, 250, 178, 198, 118,
            191, 142, 217, 16, 126, 22, 74, 251, 190, 110, 43, 108, 117, 216, 4
          ],
          [
            24, 0, 81, 82, 15, 152, 145, 231, 215, 125, 164, 180, 83, 157, 71, 186,
            211, 216, 98, 120, 143, 39, 39, 69, 56, 166, 235, 34, 78, 206, 105, 157,
            153, 204, 20, 11, 127, 186, 189, 93, 248, 166, 178, 32, 80, 116, 5, 60,
            134, 70, 248, 39, 72, 109, 0, 23, 114, 24, 172, 226, 183, 98, 242, 5
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
            164, 208, 55, 126, 21, 126, 83, 47, 91, 0, 154, 123, 47, 255, 202, 51,
            156, 140, 223, 29, 203, 98, 245, 81, 35, 100, 247, 193, 70, 147, 154, 28,
            13, 169, 34, 80, 192, 30, 252, 124, 42, 254, 142, 238, 113, 65, 232, 143,
            195, 84, 101, 103, 11, 207, 144, 28, 181, 212, 68, 106, 195, 159, 207, 5
          ]
        ]
      }' http://localhost:3000/proof-input > proof_input_for_owner.json && 
      curl -X POST -H "Content-Type: application/json" -d @proof_input_for_owner.json http://localhost:3000/solidity-calldata

      ```output
      ["0x16b679d892a0e41e3e5de722a06d78fc453a0272539b8727e1312114dcf63ba2", "0x02a3a4d661403a9de1fd564c8ece25ec3b114ae0d8cc44ee9030828508c8e97c"],[["0x07a9b824a2ed8477e38d302e99f3279a659fd32db0ab85472f6dff8c2e69f841", "0x006501a16fe43739086ce12b5a128b71e2e320204063de3efcb71e538a026925"],["0x1ceb1b1697d4624c793592c11d747f49d992c6388ba04a48821518503b7efd47", "0x1b9ab9c8a46ff189d92fc11d020f18f41b6be42f5790a936cc93116ba66b381e"]],["0x05bff5765ed5da80d183e262c0a04cae7256708783df7ce3e1ce5873236ef740", "0x292de6302473a4596f427d678921558b9f54dcaba0d7d233ff082648c659b806"],["0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266","0x0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc","0x0000000000000000000000000000000000000000000000000000000000000001","0x0000000000000000000000000000000000000000000000000000000000000028","0x0000000000000000000000000000000000000000000000000000000000000014","0x00000000000000000000000000000000f53c7ac01e2dddc0c5035ba25a71d602","0x00000000000000000000000000000000a1e508d7148eb28b1bbafc2b56b6d6c9"]
      ```
  
   5. Provider1 generate Solidity Calldata from request sent from user1:
  
      curl -X POST -H "Content-Type: application/json" -d '{
         "requests": [
           {
             "nonce": 1,
             "fee": "10",
             "userAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
             "providerAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
           },
           {
             "nonce": 2,
             "fee": "10",
             "userAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
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
            196, 202, 55, 243, 25, 48, 184, 86, 114, 156, 45, 140, 84, 146, 121, 144,
            242, 234, 217, 249, 210, 19, 8, 7, 57, 216, 72, 74, 156, 221, 80, 138, 52,
            4, 181, 122, 231, 252, 181, 38, 79, 26, 101, 124, 191, 250, 178, 198, 118,
            191, 142, 217, 16, 126, 22, 74, 251, 190, 110, 43, 108, 117, 216, 4
          ],
          [
            24, 0, 81, 82, 15, 152, 145, 231, 215, 125, 164, 180, 83, 157, 71, 186,
            211, 216, 98, 120, 143, 39, 39, 69, 56, 166, 235, 34, 78, 206, 105, 157,
            153, 204, 20, 11, 127, 186, 189, 93, 248, 166, 178, 32, 80, 116, 5, 60,
            134, 70, 248, 39, 72, 109, 0, 23, 114, 24, 172, 226, 183, 98, 242, 5
          ]
        ]
      }' http://localhost:3000/proof-input > proof_input_for_user1.json && 
      curl -X POST -H "Content-Type: application/json" -d @proof_input_for_user1.json http://localhost:3000/solidity-calldata

      ```output
      ["0x0244952287d019f83c213c6c42c2891c833ce6c55e34cf92872fa6274c5fa9a7", "0x09ed8b61238f539af924a2b082e99e4b8eb1ab5756b020fd38ff26a57b032b54"],[["0x03dd0544f210d377a03db58143eff35e24716421b1fbdae1bf55980229c45a01", "0x096417314c7ea7e675614b174561af4b097b81a3b90cf8ab4a4d9d0ce2dc425d"],["0x05dcc58706f3dfb7e4945a5a7948461967ce0e927b07f8a67e01bca8d70a905f", "0x0a1f0e420564280e764d2384cc6620c32d173eb5135d2350bf36799a04a0bcca"]],["0x2317d50b3fbe571866a9f39cd3aeb2a4565143157f649061cd6e1b769d793771", "0x005d854ca70ff1adc7fad10eeea57fe26db9eb3434ecb116b9aac3a1c47ab05d"],["0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8","0x0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc","0x0000000000000000000000000000000000000000000000000000000000000001","0x0000000000000000000000000000000000000000000000000000000000000028","0x0000000000000000000000000000000000000000000000000000000000000014","0x00000000000000000000000000000000f53c7ac01e2dddc0c5035ba25a71d602","0x00000000000000000000000000000000a1e508d7148eb28b1bbafc2b56b6d6c9"]
      ```

   6. Combine the calldata from the owner and user1 (flatten and concatenate inProof and proofInput) into a single calldata for batch verification

*/

export const succeedInProof = [
    BigInt("0x16b679d892a0e41e3e5de722a06d78fc453a0272539b8727e1312114dcf63ba2"),
    BigInt("0x02a3a4d661403a9de1fd564c8ece25ec3b114ae0d8cc44ee9030828508c8e97c"),
    BigInt("0x07a9b824a2ed8477e38d302e99f3279a659fd32db0ab85472f6dff8c2e69f841"),
    BigInt("0x006501a16fe43739086ce12b5a128b71e2e320204063de3efcb71e538a026925"),
    BigInt("0x1ceb1b1697d4624c793592c11d747f49d992c6388ba04a48821518503b7efd47"),
    BigInt("0x1b9ab9c8a46ff189d92fc11d020f18f41b6be42f5790a936cc93116ba66b381e"),
    BigInt("0x05bff5765ed5da80d183e262c0a04cae7256708783df7ce3e1ce5873236ef740"),
    BigInt("0x292de6302473a4596f427d678921558b9f54dcaba0d7d233ff082648c659b806"),
    BigInt("0x0244952287d019f83c213c6c42c2891c833ce6c55e34cf92872fa6274c5fa9a7"),
    BigInt("0x09ed8b61238f539af924a2b082e99e4b8eb1ab5756b020fd38ff26a57b032b54"),
    BigInt("0x03dd0544f210d377a03db58143eff35e24716421b1fbdae1bf55980229c45a01"),
    BigInt("0x096417314c7ea7e675614b174561af4b097b81a3b90cf8ab4a4d9d0ce2dc425d"),
    BigInt("0x05dcc58706f3dfb7e4945a5a7948461967ce0e927b07f8a67e01bca8d70a905f"),
    BigInt("0x0a1f0e420564280e764d2384cc6620c32d173eb5135d2350bf36799a04a0bcca"),
    BigInt("0x2317d50b3fbe571866a9f39cd3aeb2a4565143157f649061cd6e1b769d793771"),
    BigInt("0x005d854ca70ff1adc7fad10eeea57fe26db9eb3434ecb116b9aac3a1c47ab05d"),
];

export const succeedProofInputs = [
    BigInt("0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266"),
    BigInt("0x0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc"),
    BigInt("0x0000000000000000000000000000000000000000000000000000000000000001"),
    BigInt("0x0000000000000000000000000000000000000000000000000000000000000028"),
    BigInt("0x0000000000000000000000000000000000000000000000000000000000000014"),
    BigInt("0x00000000000000000000000000000000f53c7ac01e2dddc0c5035ba25a71d602"),
    BigInt("0x00000000000000000000000000000000a1e508d7148eb28b1bbafc2b56b6d6c9"),
    BigInt("0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8"),
    BigInt("0x0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc"),
    BigInt("0x0000000000000000000000000000000000000000000000000000000000000001"),
    BigInt("0x0000000000000000000000000000000000000000000000000000000000000028"),
    BigInt("0x0000000000000000000000000000000000000000000000000000000000000014"),
    BigInt("0x00000000000000000000000000000000f53c7ac01e2dddc0c5035ba25a71d602"),
    BigInt("0x00000000000000000000000000000000a1e508d7148eb28b1bbafc2b56b6d6c9"),
];

/**
 * The fee is calculated by summing all fees in the requests: 10 + 10 = 20
 */
export const succeedFee = 20;
