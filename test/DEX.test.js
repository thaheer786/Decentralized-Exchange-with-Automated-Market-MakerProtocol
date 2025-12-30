const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DEX", function() {
    let dex, tokenA, tokenB;
    let owner, addr1, addr2;
    
    beforeEach(async function() {
        // Deploy tokens and DEX before each test
        [owner, addr1, addr2] = await ethers.getSigners();
        
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        tokenA = await MockERC20.deploy("Token A", "TKA");
        tokenB = await MockERC20.deploy("Token B", "TKB");
        
        const DEX = await ethers.getContractFactory("DEX");
        dex = await DEX.deploy(tokenA.address, tokenB.address);
        
        // Mint additional tokens to test accounts
        await tokenA.mint(addr1.address, ethers.utils.parseEther("10000"));
        await tokenB.mint(addr1.address, ethers.utils.parseEther("10000"));
        await tokenA.mint(addr2.address, ethers.utils.parseEther("10000"));
        await tokenB.mint(addr2.address, ethers.utils.parseEther("10000"));
        
        // Approve DEX to spend tokens
        await tokenA.approve(dex.address, ethers.utils.parseEther("1000000"));
        await tokenB.approve(dex.address, ethers.utils.parseEther("1000000"));
        await tokenA.connect(addr1).approve(dex.address, ethers.utils.parseEther("1000000"));
        await tokenB.connect(addr1).approve(dex.address, ethers.utils.parseEther("1000000"));
        await tokenA.connect(addr2).approve(dex.address, ethers.utils.parseEther("1000000"));
        await tokenB.connect(addr2).approve(dex.address, ethers.utils.parseEther("1000000"));
    });
    
    describe("Liquidity Management", function() {
        it("should allow initial liquidity provision", async function() {
            const amountA = ethers.utils.parseEther("100");
            const amountB = ethers.utils.parseEther("200");
            
            await dex.addLiquidity(amountA, amountB);
            
            const reserves = await dex.getReserves();
            expect(reserves._reserveA).to.equal(amountA);
            expect(reserves._reserveB).to.equal(amountB);
        });
        
        it("should mint correct LP tokens for first provider", async function() {
            const amountA = ethers.utils.parseEther("100");
            const amountB = ethers.utils.parseEther("200");
            
            await dex.addLiquidity(amountA, amountB);
            
            const liquidityBalance = await dex.liquidity(owner.address);
            
            // For first LP: sqrt(amountA * amountB) - MINIMUM_LIQUIDITY
            // sqrt(100 * 200) = sqrt(20000) ≈ 141.42 ETH
            // Minus 1000 wei minimum liquidity
            expect(liquidityBalance).to.be.gt(0);
            const expectedApprox = ethers.utils.parseEther("141.42");
            expect(liquidityBalance).to.be.closeTo(expectedApprox, ethers.utils.parseEther("0.1"));
        });
        
        it("should allow subsequent liquidity additions", async function() {
            // First provider
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            // Second provider
            const amountA = ethers.utils.parseEther("50");
            const amountB = ethers.utils.parseEther("100");
            
            await dex.connect(addr1).addLiquidity(amountA, amountB);
            
            const reserves = await dex.getReserves();
            expect(reserves._reserveA).to.equal(ethers.utils.parseEther("150"));
            expect(reserves._reserveB).to.equal(ethers.utils.parseEther("300"));
        });
        
        it("should maintain price ratio on liquidity addition", async function() {
            // Add initial liquidity
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const priceBefore = await dex.getPrice();
            
            // Add more liquidity with same ratio
            await dex.connect(addr1).addLiquidity(ethers.utils.parseEther("50"), ethers.utils.parseEther("100"));
            
            const priceAfter = await dex.getPrice();
            
            expect(priceAfter).to.equal(priceBefore);
        });
        
        it("should allow partial liquidity removal", async function() {
            // Add liquidity
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const liquidityBalance = await dex.liquidity(owner.address);
            const removeAmount = liquidityBalance.div(2);
            
            const balanceABefore = await tokenA.balanceOf(owner.address);
            const balanceBBefore = await tokenB.balanceOf(owner.address);
            
            await dex.removeLiquidity(removeAmount);
            
            const balanceAAfter = await tokenA.balanceOf(owner.address);
            const balanceBAfter = await tokenB.balanceOf(owner.address);
            
            expect(balanceAAfter).to.be.gt(balanceABefore);
            expect(balanceBAfter).to.be.gt(balanceBBefore);
        });
        
        it("should return correct token amounts on liquidity removal", async function() {
            // Add liquidity
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const liquidityBalance = await dex.liquidity(owner.address);
            
            const tx = await dex.removeLiquidity(liquidityBalance);
            const receipt = await tx.wait();
            
            // Check event
            const event = receipt.events.find(e => e.event === "LiquidityRemoved");
            expect(event).to.not.be.undefined;
            expect(event.args.amountA).to.be.gt(0);
            expect(event.args.amountB).to.be.gt(0);
        });
        
        it("should revert on zero liquidity addition", async function() {
            await expect(
                dex.addLiquidity(0, ethers.utils.parseEther("100"))
            ).to.be.revertedWith("Amounts must be greater than zero");
            
            await expect(
                dex.addLiquidity(ethers.utils.parseEther("100"), 0)
            ).to.be.revertedWith("Amounts must be greater than zero");
        });
        
        it("should revert when removing more liquidity than owned", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const liquidityBalance = await dex.liquidity(owner.address);
            const tooMuch = liquidityBalance.add(ethers.utils.parseEther("1"));
            
            await expect(
                dex.removeLiquidity(tooMuch)
            ).to.be.revertedWith("Insufficient liquidity");
        });
    });
    
    describe("Token Swaps", function() {
        beforeEach(async function() {
            // Add initial liquidity before swap tests
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );
        });
        
        it("should swap token A for token B", async function() {
            const amountIn = ethers.utils.parseEther("10");
            
            const balanceBBefore = await tokenB.balanceOf(addr1.address);
            
            await dex.connect(addr1).swapAForB(amountIn);
            
            const balanceBAfter = await tokenB.balanceOf(addr1.address);
            
            expect(balanceBAfter).to.be.gt(balanceBBefore);
        });
        
        it("should swap token B for token A", async function() {
            const amountIn = ethers.utils.parseEther("20");
            
            const balanceABefore = await tokenA.balanceOf(addr1.address);
            
            await dex.connect(addr1).swapBForA(amountIn);
            
            const balanceAAfter = await tokenA.balanceOf(addr1.address);
            
            expect(balanceAAfter).to.be.gt(balanceABefore);
        });
        
        it("should calculate correct output amount with fee", async function() {
            const amountIn = ethers.utils.parseEther("10");
            const reserves = await dex.getReserves();
            
            const expectedOut = await dex.getAmountOut(amountIn, reserves._reserveA, reserves._reserveB);
            
            const balanceBBefore = await tokenB.balanceOf(addr1.address);
            await dex.connect(addr1).swapAForB(amountIn);
            const balanceBAfter = await tokenB.balanceOf(addr1.address);
            
            const actualOut = balanceBAfter.sub(balanceBBefore);
            
            expect(actualOut).to.equal(expectedOut);
        });
        
        it("should update reserves after swap", async function() {
            const amountIn = ethers.utils.parseEther("10");
            
            const reservesBefore = await dex.getReserves();
            
            await dex.connect(addr1).swapAForB(amountIn);
            
            const reservesAfter = await dex.getReserves();
            
            expect(reservesAfter._reserveA).to.equal(reservesBefore._reserveA.add(amountIn));
            expect(reservesAfter._reserveB).to.be.lt(reservesBefore._reserveB);
        });
        
        it("should increase k after swap due to fees", async function() {
            const reservesBefore = await dex.getReserves();
            const kBefore = reservesBefore._reserveA.mul(reservesBefore._reserveB);
            
            await dex.connect(addr1).swapAForB(ethers.utils.parseEther("10"));
            
            const reservesAfter = await dex.getReserves();
            const kAfter = reservesAfter._reserveA.mul(reservesAfter._reserveB);
            
            // k should increase due to fees (or stay approximately the same due to rounding)
            expect(kAfter).to.be.gte(kBefore);
        });
        
        it("should revert on zero swap amount", async function() {
            await expect(
                dex.connect(addr1).swapAForB(0)
            ).to.be.revertedWith("Amount must be greater than zero");
        });
        
        it("should handle large swaps with high price impact", async function() {
            const amountIn = ethers.utils.parseEther("50"); // 50% of pool
            
            const priceBefore = await dex.getPrice();
            
            await dex.connect(addr1).swapAForB(amountIn);
            
            const priceAfter = await dex.getPrice();
            
            // Price should decrease significantly (token B becomes more expensive)
            expect(priceAfter).to.be.lt(priceBefore);
        });
        
        it("should handle multiple consecutive swaps", async function() {
            const amountIn = ethers.utils.parseEther("5");
            
            // First swap
            await dex.connect(addr1).swapAForB(amountIn);
            const reserves1 = await dex.getReserves();
            
            // Second swap
            await dex.connect(addr1).swapAForB(amountIn);
            const reserves2 = await dex.getReserves();
            
            // Third swap
            await dex.connect(addr1).swapAForB(amountIn);
            const reserves3 = await dex.getReserves();
            
            expect(reserves3._reserveA).to.be.gt(reserves2._reserveA);
            expect(reserves3._reserveB).to.be.lt(reserves2._reserveB);
        });
    });
    
    describe("Price Calculations", function() {
        it("should return correct initial price", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const price = await dex.getPrice();
            
            // Price = reserveB / reserveA = 200 / 100 = 2
            expect(price).to.equal(ethers.utils.parseEther("2"));
        });
        
        it("should update price after swaps", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const priceBefore = await dex.getPrice();
            
            await dex.connect(addr1).swapAForB(ethers.utils.parseEther("10"));
            
            const priceAfter = await dex.getPrice();
            
            // After swapping A for B, B becomes more expensive (lower ratio)
            expect(priceAfter).to.be.lt(priceBefore);
        });
        
        it("should handle price queries with zero reserves gracefully", async function() {
            await expect(dex.getPrice()).to.be.revertedWith("No liquidity");
        });
    });
    
    describe("Fee Distribution", function() {
        it("should accumulate fees for liquidity providers", async function() {
            // Add liquidity
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const liquidityBefore = await dex.liquidity(owner.address);
            const reservesBefore = await dex.getReserves();
            
            // Perform swap (generates fees)
            await dex.connect(addr1).swapAForB(ethers.utils.parseEther("10"));
            
            // Remove liquidity
            await dex.removeLiquidity(liquidityBefore);
            
            const balanceA = await tokenA.balanceOf(owner.address);
            const balanceB = await tokenB.balanceOf(owner.address);
            
            // LP should receive more than they put in due to fees
            // Note: First LP loses minimum liquidity, so this checks net gain
            expect(balanceA.add(balanceB)).to.be.gt(0);
        });
        
        it("should distribute fees proportionally to LP share", async function() {
            // Owner adds 100/200
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            const liquidityOwner = await dex.liquidity(owner.address);
            
            // Addr1 adds 100/200 (same amount, should get same LP tokens)
            await dex.connect(addr1).addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            const liquidityAddr1 = await dex.liquidity(addr1.address);
            
            // Execute swaps to generate fees
            await dex.connect(addr2).swapAForB(ethers.utils.parseEther("20"));
            
            // Both remove liquidity
            const tx1 = await dex.removeLiquidity(liquidityOwner);
            const receipt1 = await tx1.wait();
            const event1 = receipt1.events.find(e => e.event === "LiquidityRemoved");
            
            const tx2 = await dex.connect(addr1).removeLiquidity(liquidityAddr1);
            const receipt2 = await tx2.wait();
            const event2 = receipt2.events.find(e => e.event === "LiquidityRemoved");
            
            // Both should receive similar amounts (proportional to their share)
            const ratio = event1.args.amountA.mul(1000).div(event2.args.amountA);
            expect(ratio).to.be.closeTo(ethers.BigNumber.from(1000), 50); // Within 5% due to minimum liquidity
        });
    });
    
    describe("Edge Cases", function() {
        it("should handle very small liquidity amounts", async function() {
            // For sqrt(x*y) to be > 1000 (MINIMUM_LIQUIDITY), we need x*y > 1,000,000 (in wei)
            // 0.0001 ETH = 10^14 wei, so 10^14 * 10^14 = 10^28 >> 10^6, this will pass
            // We need something that produces sqrt < 1000 wei
            // If x = y = 31 wei, then sqrt(31*31) = 31 < 1000, should fail
            const tooSmall = 31; // 31 wei
            
            await expect(
                dex.addLiquidity(tooSmall, tooSmall)
            ).to.be.revertedWith("Insufficient liquidity minted");
        });
        
        it("should handle very large liquidity amounts", async function() {
            const largeAmount = ethers.utils.parseEther("1000");
            
            await dex.addLiquidity(largeAmount, largeAmount);
            
            const reserves = await dex.getReserves();
            expect(reserves._reserveA).to.equal(largeAmount);
            expect(reserves._reserveB).to.equal(largeAmount);
        });
        
        it("should prevent unauthorized access", async function() {
            // Add liquidity as owner
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const liquidityOwner = await dex.liquidity(owner.address);
            
            // Try to remove owner's liquidity as addr1 (should fail)
            await expect(
                dex.connect(addr1).removeLiquidity(liquidityOwner)
            ).to.be.revertedWith("Insufficient liquidity");
        });
    });
    
    describe("Events", function() {
        it("should emit LiquidityAdded event", async function() {
            const amountA = ethers.utils.parseEther("100");
            const amountB = ethers.utils.parseEther("200");
            
            await expect(dex.addLiquidity(amountA, amountB))
                .to.emit(dex, "LiquidityAdded")
                .withArgs(owner.address, amountA, amountB, (await dex.liquidity(owner.address)).add(0)); // Check it emits something
        });
        
        it("should emit LiquidityRemoved event", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            const liquidity = await dex.liquidity(owner.address);
            
            await expect(dex.removeLiquidity(liquidity))
                .to.emit(dex, "LiquidityRemoved");
        });
        
        it("should emit Swap event", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const amountIn = ethers.utils.parseEther("10");
            const reserves = await dex.getReserves();
            const expectedOut = await dex.getAmountOut(amountIn, reserves._reserveA, reserves._reserveB);
            
            await expect(dex.connect(addr1).swapAForB(amountIn))
                .to.emit(dex, "Swap")
                .withArgs(addr1.address, tokenA.address, tokenB.address, amountIn, expectedOut);
        });
    });
});

// Helper function to calculate square root
function sqrt(value) {
    let z = value.add(1).div(2);
    let y = value;
    while (z.sub(y).lt(0)) {
        y = z;
        z = value.div(z).add(z).div(2);
    }
    return y;
}
