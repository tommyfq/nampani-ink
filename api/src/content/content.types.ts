export interface Address {
  street: string;
  locality: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface Studio {
  name: string;
  monogram: string;
  tagline: string;
  description: string;
  city: string;
  region: string;
  country: string;
  established: number;
  rating: { score: number; count: number; source: string };
  priceFrom: string;
  priceRange: string;
  hoursNote: string;
  email: string;
  whatsapp: string;
  social: Record<string, string>;
  nearbyAreas: string[];
}

export interface Branch {
  id: string;
  name: string;
  badge: string;
  area: string;
  address: Address;
  hours: string;
  opens: string;
  closes: string;
  whatsapp: string;
  mapsUrl: string;
  geo: { lat: number; lng: number } | null;
  intro: string;
}

export interface Style {
  id: string;
  name: string;
  badge: string;
  motif: string;
  image: string | null;
  description: string;
}

export interface Artist {
  id: string;
  name: string;
  role: string;
  branch: string;
  years: number;
  motif: string;
  photo: string | null;
  bio: string;
  specialties: string[];
}

export interface Work {
  id: string;
  style: string;
  artist: string;
  placement: string;
  size: string;
  motif: string;
  image: string | null;
}

export interface Review {
  name: string;
  text: string;
  artist: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface Accent {
  /** Word in Javanese script (decorative). Verify with a native reader. */
  jv: string;
  latin: string;
  meaning: string;
}

export interface PrepTip {
  title: string;
  text: string;
}

export interface SiteContent {
  studio: Studio;
  branches: Branch[];
  styles: Style[];
  artists: Artist[];
  gallery: Work[];
  reviews: Review[];
  faqs: Faq[];
  accents: Record<string, Accent>;
  prep: PrepTip[];
}
