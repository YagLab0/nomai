export * from "./types.js";
export * from "./catalog.js";
export * from "./inventory.js";
export * from "./availability.js";

export type {
  BookInput,
  BookResult,
  BookingDetail,
  BookingDetailResult,
  BookingOwner,
  BookingSummary,
  ClaimErrorCode,
  ClaimInput,
  ClaimResult,
  CancelErrorCode,
  CancelInput,
  CancelResult,
  Cancellation,
  DomainError,
  DomainErrorCode,
  ListingCard,
  ListingDetail,
  Quote,
  QuoteError,
  QuoteErrorCode,
  SearchParams,
} from "./repo.js";
export { formatMoney, releaseMockBooking, settleMockBooking } from "./repo.js";

import {
  bookListing as mockBookListing,
  cancelBooking as mockCancelBooking,
  getBookingById as mockGetBookingById,
  getBookingDetail as mockGetBookingDetail,
  listBookings as mockListBookings,
  openClaim as mockOpenClaim,
  getListingBySlug as mockGetListingBySlug,
  getListingPayTo as mockGetListingPayTo,
  quoteStay as mockQuoteStay,
  searchListings as mockSearchListings,
} from "./repo.js";
import {
  bookListing as supabaseBookListing,
  cancelBooking as supabaseCancelBooking,
  getBookingById as supabaseGetBookingById,
  getBookingDetail as supabaseGetBookingDetail,
  listBookings as supabaseListBookings,
  openClaim as supabaseOpenClaim,
  getListingBySlug as supabaseGetListingBySlug,
  getListingPayTo as supabaseGetListingPayTo,
  quoteStay as supabaseQuoteStay,
  searchListings as supabaseSearchListings,
} from "./supabase.js";

const dataSource = (process.env.LISTINGS_DATA_SOURCE ?? "mock")
  .trim()
  .toLowerCase();

export const LISTINGS_DATA_SOURCE = dataSource;

// The listings backend behind the API surface — the seam behind issue #12.
// `mock` (default) serves the in-memory store in repo.ts; `supabase` serves the
// linked Supabase project through the admin client. The functions below share
// one interface, so routes / agent tools never change.
export const searchListings =
  dataSource === "supabase" ? supabaseSearchListings : mockSearchListings;
export const getListingBySlug =
  dataSource === "supabase" ? supabaseGetListingBySlug : mockGetListingBySlug;
export const quoteStay =
  dataSource === "supabase" ? supabaseQuoteStay : mockQuoteStay;
export const bookListing =
  dataSource === "supabase" ? supabaseBookListing : mockBookListing;
export const getBookingById =
  dataSource === "supabase" ? supabaseGetBookingById : mockGetBookingById;
export const getListingPayTo =
  dataSource === "supabase" ? supabaseGetListingPayTo : mockGetListingPayTo;
export const cancelBooking =
  dataSource === "supabase" ? supabaseCancelBooking : mockCancelBooking;
export const listBookings =
  dataSource === "supabase" ? supabaseListBookings : mockListBookings;
export const getBookingDetail =
  dataSource === "supabase" ? supabaseGetBookingDetail : mockGetBookingDetail;
export const openClaim =
  dataSource === "supabase" ? supabaseOpenClaim : mockOpenClaim;
