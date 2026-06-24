# AIJudge Contract

`AIJudge.sol` implements a two-deadline commit-reveal bounty with a single batched Ritual LLM call and human-controlled finalization.

## Commands

```powershell
$env:CI='true'
corepack pnpm@10.28.2 install --frozen-lockfile
corepack pnpm@10.28.2 exec hardhat test
corepack pnpm@10.28.2 exec hardhat compile --build-profile production
```

Deploy to Ritual after placing `DEPLOYER_PRIVATE_KEY` in the encrypted Hardhat keystore:

```powershell
corepack pnpm@10.28.2 exec hardhat keystore set DEPLOYER_PRIVATE_KEY
corepack pnpm@10.28.2 exec hardhat ignition deploy ignition/modules/AIJudge.ts --network ritual --deployment-id privacy-preserving-ai-judge
```

Never commit the key or a mnemonic. The `ritual` network is chain ID 1979 at `https://rpc.ritualfoundation.org`.
