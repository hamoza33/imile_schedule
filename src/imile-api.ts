const BASE_URL = "https://mweb.imile.com";

interface ApiResponse<T> {
  status: string;
  resultCode: string;
  resultObject: T;
  message: string;
  traceId: string;
  requestToken: string;
}

export interface OrderBaseInfoVO {
  orderNumber: string;
  clientName: string;
  sku: string;
  skuQty: number;
  currency: string;
  collectingMoney: string;
  detailAddress: string;
  city: string;
  area: string;
  country: string;
  province: string;
  zipcode: string | null;
  isReturnType: boolean;
  ppdOrder: boolean;
  suburb: string | null;
  endStatus: string | null;
  consigneePhone: string;
}

export interface OrderPoint {
  longitude: string;
  latitude: string;
  isTrustOrderPoint: boolean;
  isLastDeliveredPoint: boolean;
  latAndLngScale: string;
}

export interface TrackDetail {
  content: string;
  stage: number;
  stageDesc: string;
  time: string;
  mobile: string | null;
}

export interface CollectResult {
  orderBaseInfoVO: OrderBaseInfoVO;
  orderPoint: OrderPoint;
  trackDetailVoList: TrackDetail[];
  isShowMapTrack: boolean;
  uniqueKey: string;
  showAddress: boolean;
  allowSchedule: boolean;
  notAllowScheduleDetail: string | null;
  allowChangeLocation: boolean;
  allowReceivePreference: boolean;
  lastScheduleTime: string | null;
  notScheduleType: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverLocationFreshTime: string | null;
}

export interface ScheduleResult {
  isGreaterOfd: boolean;
  dateIsRang: boolean;
  allowSchedule: boolean;
  adviceDate: string | null;
  dateList: string[] | null;
}

async function apiPost<T>(path: string, data: Record<string, unknown>): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<ApiResponse<T>>;
}

export async function getOrderInfo(orderNumber: string): Promise<CollectResult> {
  const res = await apiPost<CollectResult>("/cornerstone/collet/address/new/collect", {
    orderNumber,
  });
  if (res.status !== "success") {
    throw new Error(`Failed to get order info: ${res.message || res.resultCode}`);
  }
  return res.resultObject;
}

export async function scheduleDelivery(
  orderNumber: string,
  scheduleTime: string
): Promise<ScheduleResult> {
  const orderInfo = await getOrderInfo(orderNumber);

  if (!orderInfo.allowSchedule) {
    throw new Error(
      `Scheduling not allowed for order ${orderNumber}. ${orderInfo.notAllowScheduleDetail || ""}`
    );
  }

  const res = await apiPost<ScheduleResult>("/cornerstone/collet/address/submitScheduleTime", {
    orderNumber,
    uniqueKey: orderInfo.uniqueKey,
    scheduleTime,
  });

  if (res.status !== "success") {
    throw new Error(`Failed to schedule delivery: ${res.message || res.resultCode}`);
  }

  return res.resultObject;
}

export async function sendAddressChangeOtp(orderNumber: string): Promise<{ sent: boolean; phone: string }> {
  const orderInfo = await getOrderInfo(orderNumber);

  if (!orderInfo.allowChangeLocation) {
    throw new Error(`Address change not allowed for order ${orderNumber}`);
  }

  const res = await apiPost<boolean>("/cornerstone/collet/otp/send", {
    orderNumber,
    uniqueKey: orderInfo.uniqueKey,
  });

  if (res.status !== "success") {
    throw new Error(`Failed to send OTP: ${res.message || res.resultCode}`);
  }

  return {
    sent: res.resultObject,
    phone: orderInfo.orderBaseInfoVO.consigneePhone,
  };
}

export async function verifyOtpAndChangeAddress(
  orderNumber: string,
  otp: string,
  newAddress: string,
  city: string,
  area?: string,
  province?: string,
  country?: string
): Promise<CollectResult> {
  const orderInfo = await getOrderInfo(orderNumber);

  const verifyRes = await apiPost<boolean>("/cornerstone/collet/otp/verify", {
    orderNumber,
    uniqueKey: orderInfo.uniqueKey,
    otpCode: otp,
  });

  if (verifyRes.status !== "success" || !verifyRes.resultObject) {
    throw new Error(`OTP verification failed: ${verifyRes.message || "Invalid code"}`);
  }

  const res = await apiPost<CollectResult>("/cornerstone/collet/address/new/collect", {
    orderNumber,
    uniqueKey: orderInfo.uniqueKey,
    detailAddress: newAddress,
    city,
    area: area || "",
    province: province || "",
    country: country || orderInfo.orderBaseInfoVO.country,
  });

  if (res.status !== "success") {
    throw new Error(`Failed to change address: ${res.message || res.resultCode}`);
  }

  return res.resultObject;
}

export async function checkScheduleAvailability(orderNumber: string): Promise<boolean> {
  const res = await apiPost<boolean>("/cornerstone/collet/checkSchedule", {
    orderNumber,
  });
  return res.status === "success" && res.resultObject === true;
}
