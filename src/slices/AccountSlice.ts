import { ethers } from "ethers";
import { addresses } from "../constants";
import { abi as ierc20Abi } from "../abi/IERC20.json";
import { abi as sMADAO } from "../abi/sMadao.json";
import { abi as MaNftABI } from "../abi/MaNft.json";
import { setAll } from "../helpers";

import { createAsyncThunk, createSelector, createSlice } from "@reduxjs/toolkit";
import { RootState } from "src/store";
import { IBaseAddressAsyncThunk, ICalcUserBondDetailsAsyncThunk } from "./interfaces";

export const getBalances = createAsyncThunk(
  "account/getBalances",
  async ({ address, networkID, provider }: IBaseAddressAsyncThunk) => {
    const madaoContract = new ethers.Contract(addresses[networkID].MADAO_ADDRESS as string, ierc20Abi, provider);
    const madaoBalance = await madaoContract.balanceOf(address);
    const smadaoContract = new ethers.Contract(addresses[networkID].SMADAO_ADDRESS as string, ierc20Abi, provider);
    const smadaoBalance = await smadaoContract.balanceOf(address);
    const maNftContract = new ethers.Contract(addresses[networkID].MANFT_ADDRESS as string, ierc20Abi, provider);
    const maNftBalance = await maNftContract.balanceOf(address);


    return {
      balances: {
        madao: ethers.utils.formatUnits(madaoBalance, "gwei"),
        smadao: ethers.utils.formatUnits(smadaoBalance, "gwei"),
        manft: ethers.utils.formatUnits(maNftBalance, "gwei"),
      },
    };
  },
);

export const loadAccountDetails = createAsyncThunk(
  "account/loadAccountDetails",
  async ({ networkID, provider, address }: IBaseAddressAsyncThunk) => {
    let madaoBalance = 0;
    let smadaoBalance = 0;
    let stakeAllowance = 0;
    let unstakeAllowance = 0;
    let busdBondAllowance = 0;
    let maNftBalance = 0;

    const busdContract = new ethers.Contract(addresses[networkID].BUSD_ADDRESS as string, ierc20Abi, provider);
    const busdBalance = await busdContract.balanceOf(address);

    const madaoContract = new ethers.Contract(addresses[networkID].MADAO_ADDRESS as string, ierc20Abi, provider);
    madaoBalance = await madaoContract.balanceOf(address);
    stakeAllowance = await madaoContract.allowance(address, addresses[networkID].STAKING_HELPER_ADDRESS);

    const smadaoContract = new ethers.Contract(addresses[networkID].SMADAO_ADDRESS as string, sMADAO, provider);
    smadaoBalance = await smadaoContract.balanceOf(address);
    unstakeAllowance = await smadaoContract.allowance(address, addresses[networkID].STAKING_ADDRESS);
    const bnbBalance = await provider.getBalance(address);

    const maNftContract = new ethers.Contract(addresses[networkID].MANFT_ADDRESS as string, MaNftABI, provider);
    maNftBalance = await maNftContract.balanceOf(address);

    return {
      balances: {
        busd: ethers.utils.formatEther(busdBalance),
        madao: ethers.utils.formatUnits(madaoBalance, "gwei"),
        smadao: ethers.utils.formatUnits(smadaoBalance, "gwei"),
        bnb: ethers.utils.formatUnits(bnbBalance, "ether"),
        manft: ethers.utils.formatUnits(maNftBalance, "0"),
      },
      staking: {
        madaoStake: +stakeAllowance,
        madaoUnstake: +unstakeAllowance,
      },
      bonding: {
        busdAllowance: busdBondAllowance,
      },
    };
  },
);

export interface IUserBondDetails {
  allowance: number;
  interestDue: number;
  bondMaturationBlock: number;
  pendingPayout: string; //Payout formatted in gwei.
}
export const calculateUserBondDetails = createAsyncThunk(
  "account/calculateUserBondDetails",
  async ({ address, bond, networkID, provider }: ICalcUserBondDetailsAsyncThunk) => {
    if (!address) {
      return {
        bond: "",
        displayName: "",
        bondIconSvg: "",
        isLP: false,
        isFour: false,
        allowance: 0,
        balance: "0",
        interestDue: 0,
        bondMaturationBlock: 0,
        pendingPayout: "",
      };
    }
    // dispatch(fetchBondInProgress());

    // Calculate bond details.
    const bondContract = bond.getContractForBond(networkID, provider);
    const reserveContract = bond.getContractForReserve(networkID, provider);

    let interestDue, pendingPayout, bondMaturationBlock;

    const bondDetails = await bondContract.bondInfo(address);
    interestDue = bondDetails.payout / Math.pow(10, 9);
    bondMaturationBlock = +bondDetails.vesting + +bondDetails.lastBlock;
    pendingPayout = await bondContract.pendingPayoutFor(address);

    let allowance,
      balance = 0;
    allowance = await reserveContract.allowance(address, bond.getAddressForBond(networkID));
    balance = await reserveContract.balanceOf(address);
    // formatEthers takes BigNumber => String
    // let balanceVal = ethers.utils.formatEther(balance);
    // balanceVal should NOT be converted to a number. it loses decimal precision
    let deciamls = 18;
    let balanceVal;
    if (bond.decimals) {
      deciamls = bond.decimals;
      balanceVal = ethers.utils.formatUnits(balance, "mwei");
    }
    if (bond.isLP) {
      deciamls = 18;
    }
    balanceVal = ethers.utils.formatEther(balance);
    return {
      bond: bond.name,
      displayName: bond.displayName,
      bondIconSvg: bond.bondIconSvg,
      isLP: bond.isLP,
      isFour: bond.isFour,
      allowance: Number(allowance),
      balance: balanceVal.toString(),
      interestDue,
      bondMaturationBlock,
      pendingPayout: ethers.utils.formatUnits(pendingPayout, "gwei"),
    };
  },
);

interface IAccountSlice {
  bonds: { [key: string]: IUserBondDetails };
  balances: {
    madao: string;
    smadao: string;
    busd: string;
  };
  loading: boolean;
}
const initialState: IAccountSlice = {
  loading: false,
  bonds: {},
  balances: { madao: "", smadao: "", busd: "" },
};

const accountSlice = createSlice({
  name: "account",
  initialState,
  reducers: {
    fetchAccountSuccess(state, action) {
      setAll(state, action.payload);
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadAccountDetails.pending, state => {
        state.loading = true;
      })
      .addCase(loadAccountDetails.fulfilled, (state, action) => {
        setAll(state, action.payload);
        state.loading = false;
      })
      .addCase(loadAccountDetails.rejected, (state, { error }) => {
        state.loading = false;
        console.log(error);
      })
      .addCase(getBalances.pending, state => {
        state.loading = true;
      })
      .addCase(getBalances.fulfilled, (state, action) => {
        setAll(state, action.payload);
        state.loading = false;
      })
      .addCase(getBalances.rejected, (state, { error }) => {
        state.loading = false;
        console.log(error);
      })
      .addCase(calculateUserBondDetails.pending, state => {
        state.loading = true;
      })
      .addCase(calculateUserBondDetails.fulfilled, (state, action) => {
        if (!action.payload) return;
        const bond = action.payload.bond;
        state.bonds[bond] = action.payload;
        state.loading = false;
      })
      .addCase(calculateUserBondDetails.rejected, (state, { error }) => {
        state.loading = false;
        console.log(error);
      });
  },
});

export default accountSlice.reducer;

export const { fetchAccountSuccess } = accountSlice.actions;

const baseInfo = (state: RootState) => state.account;

export const getAccountState = createSelector(baseInfo, account => account);
