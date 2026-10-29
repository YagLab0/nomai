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
  ListingReviews,
  OwnerReviews,
  Quote,
  QuoteError,
  QuoteErrorCode,
  ReplyResult,
  ReviewCategories,
  ReviewDirection,
  ReviewErrorCode,
  ReviewView,
  SearchParams,
  SubmitReviewInput,
  SubmitReviewResult,
} from "./repo.js";
export {
  formatMoney,
  LODGING_CATEGORIES,
  releaseMockBooking,
  REVIEW_WINDOW_DAYS,
  settleMockBooking,
  TRAVELER_CATEGORIES,
} from "./repo.js";

import {
  bookListing as mockBookListing,
  cancelBooking as mockCancelBooking,
  getBookingById as mockGetBookingById,
  getBookingDetail as mockGetBookingDetail,
  listBookings as mockListBookings,
  listListingReviews as mockListListingReviews,
  listOwnerReviews as mockListOwnerReviews,
  openClaim as mockOpenClaim,
  getListingBySlug as mockGetListingBySlug,
  getListingPayTo as mockGetListingPayTo,
  quoteStay as mockQuoteStay,
  replyToReview as mockReplyToReview,
  searchListings as mockSearchListings,
  submitReview as mockSubmitReview,
  travelerScore as mockTravelerScore,
} from "./repo.js";
import {
  bookListing as supabaseBookListing,
  cancelBooking as supabaseCancelBooking,
  getBookingById as supabaseGetBookingById,
  getBookingDetail as supabaseGetBookingDetail,
  listBookings as supabaseListBookings,
  listListingReviews as supabaseListListingReviews,
  listOwnerReviews as supabaseListOwnerReviews,
  openClaim as supabaseOpenClaim,
  getListingBySlug as supabaseGetListingBySlug,
  getListingPayTo as supabaseGetListingPayTo,
  quoteStay as supabaseQuoteStay,
  replyToReview as supabaseReplyToReview,
  searchListings as supabaseSearchListings,
  submitReview as supabaseSubmitReview,
  travelerScore as supabaseTravelerScore,
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
export const listListingReviews =
  dataSource === "supabase" ? supabaseListListingReviews : mockListListingReviews;
export const listOwnerReviews =
  dataSource === "supabase" ? supabaseListOwnerReviews : mockListOwnerReviews;
export const submitReview =
  dataSource === "supabase" ? supabaseSubmitReview : mockSubmitReview;
export const replyToReview =
  dataSource === "supabase" ? supabaseReplyToReview : mockReplyToReview;
export const travelerScore =
  dataSource === "supabase" ? supabaseTravelerScore : mockTravelerScore;
