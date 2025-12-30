const { ethers } = require("hardhat");

async function main() {
    console.log("Deploying DEX AMM contracts...");
    
    // Get deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());
    
    // Deploy Mock ERC20 tokens
    console.log("\n1. Deploying Token A...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("Token A", "TKA");
    await tokenA.deployed();
    console.log("Token A deployed to:", tokenA.address);
    
    console.log("\n2. Deploying Token B...");
    const tokenB = await MockERC20.deploy("Token B", "TKB");
    await tokenB.deployed();
    console.log("Token B deployed to:", tokenB.address);
    
    // Deploy DEX
    console.log("\n3. Deploying DEX...");
    const DEX = await ethers.getContractFactory("DEX");
    const dex = await DEX.deploy(tokenA.address, tokenB.address);
    await dex.deployed();
    console.log("DEX deployed to:", dex.address);
    
    // Optional: Add initial liquidity
    console.log("\n4. Setting up initial liquidity (optional)...");
    const initialAmountA = ethers.utils.parseEther("1000");
    const initialAmountB = ethers.utils.parseEther("2000");
    
    console.log("Approving tokens...");
    await tokenA.approve(dex.address, initialAmountA);
    await tokenB.approve(dex.address, initialAmountB);
    
    console.log("Adding liquidity...");
    const tx = await dex.addLiquidity(initialAmountA, initialAmountB);
    await tx.wait();
    console.log("Initial liquidity added!");
    
    // Print summary
    console.log("\n" + "=".repeat(50));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(50));
    console.log("Token A Address:", tokenA.address);
    console.log("Token B Address:", tokenB.address);
    console.log("DEX Address:", dex.address);
    console.log("Initial Liquidity: 1000 TKA / 2000 TKB");
    console.log("Initial Price: 1 TKA = 2 TKB");
    console.log("=".repeat(50));
    
    // Save deployment addresses
    const fs = require('fs');
    const deploymentInfo = {
        network: network.name,
        tokenA: tokenA.address,
        tokenB: tokenB.address,
        dex: dex.address,
        deployer: deployer.address,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(
        'deployment-info.json',
        JSON.stringify(deploymentInfo, null, 2)
    );
    console.log("\nDeployment info saved to deployment-info.json");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
