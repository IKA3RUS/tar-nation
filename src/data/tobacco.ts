/**
 * Adult tobacco use in India, by state / union territory.
 *
 * `prevalence` — % of adults (15+) currently using tobacco in any form (smoked
 * and/or smokeless). Source: Global Adult Tobacco Survey 2 (GATS-2), India
 * 2016-17, Ministry of Health & Family Welfare / TISS.
 * https://ntcp.mohfw.gov.in/assets/document/surveys-reports-publications/Global-Adult-Tobacco-Survey-Second-Round-India-2016-2017.pdf.
 *
 * `adults` — approximate adult population in millions, projected from the 2011
 * Census to the GATS-2 survey window. Used only to convert a rate into a
 * headcount for the cartogram's area encoding.
 *
 * `lon` / `lat` — approximate geographic centroid, the seed position for the
 * Dorling layout.
 */
export type StateTobacco = {
  code: string;
  name: string;
  lon: number;
  lat: number;
  /** % of adults using tobacco in any form. */
  prevalence: number;
  /** Adult population, millions. */
  adults: number;
};

export const TOBACCO_BY_STATE: StateTobacco[] = [
  {
    code: "JK",
    name: "Jammu & Kashmir",
    lon: 75.3,
    lat: 33.8,
    prevalence: 20.8,
    adults: 8.0,
  },
  {
    code: "HP",
    name: "Himachal Pradesh",
    lon: 77.2,
    lat: 31.8,
    prevalence: 21.2,
    adults: 4.8,
  },
  {
    code: "PB",
    name: "Punjab",
    lon: 75.4,
    lat: 31.0,
    prevalence: 13.4,
    adults: 19.0,
  },
  {
    code: "CH",
    name: "Chandigarh",
    lon: 76.78,
    lat: 30.73,
    prevalence: 13.2,
    adults: 0.8,
  },
  {
    code: "UK",
    name: "Uttarakhand",
    lon: 79.3,
    lat: 30.1,
    prevalence: 30.6,
    adults: 6.6,
  },
  {
    code: "HR",
    name: "Haryana",
    lon: 76.1,
    lat: 29.2,
    prevalence: 23.8,
    adults: 17.0,
  },
  {
    code: "DL",
    name: "Delhi",
    lon: 77.1,
    lat: 28.65,
    prevalence: 17.8,
    adults: 12.0,
  },
  {
    code: "RJ",
    name: "Rajasthan",
    lon: 74.2,
    lat: 26.6,
    prevalence: 24.7,
    adults: 43.0,
  },
  {
    code: "UP",
    name: "Uttar Pradesh",
    lon: 80.9,
    lat: 26.8,
    prevalence: 35.5,
    adults: 130.0,
  },
  {
    code: "BR",
    name: "Bihar",
    lon: 85.8,
    lat: 25.7,
    prevalence: 25.9,
    adults: 62.0,
  },
  {
    code: "SK",
    name: "Sikkim",
    lon: 88.5,
    lat: 27.5,
    prevalence: 27.5,
    adults: 0.45,
  },
  {
    code: "AR",
    name: "Arunachal Pradesh",
    lon: 94.3,
    lat: 28.0,
    prevalence: 45.5,
    adults: 0.9,
  },
  {
    code: "NL",
    name: "Nagaland",
    lon: 94.4,
    lat: 26.1,
    prevalence: 43.3,
    adults: 1.3,
  },
  {
    code: "AS",
    name: "Assam",
    lon: 92.9,
    lat: 26.2,
    prevalence: 48.2,
    adults: 20.0,
  },
  {
    code: "ML",
    name: "Meghalaya",
    lon: 91.4,
    lat: 25.5,
    prevalence: 47.0,
    adults: 1.8,
  },
  {
    code: "MN",
    name: "Manipur",
    lon: 93.9,
    lat: 24.7,
    prevalence: 55.1,
    adults: 1.9,
  },
  {
    code: "TR",
    name: "Tripura",
    lon: 91.7,
    lat: 23.8,
    prevalence: 64.5,
    adults: 2.5,
  },
  {
    code: "MZ",
    name: "Mizoram",
    lon: 92.9,
    lat: 23.3,
    prevalence: 58.7,
    adults: 0.7,
  },
  {
    code: "WB",
    name: "West Bengal",
    lon: 87.9,
    lat: 23.5,
    prevalence: 33.5,
    adults: 63.0,
  },
  {
    code: "JH",
    name: "Jharkhand",
    lon: 85.4,
    lat: 23.6,
    prevalence: 38.9,
    adults: 20.0,
  },
  {
    code: "MP",
    name: "Madhya Pradesh",
    lon: 78.5,
    lat: 23.5,
    prevalence: 34.2,
    adults: 46.0,
  },
  {
    code: "GJ",
    name: "Gujarat",
    lon: 71.6,
    lat: 22.5,
    prevalence: 25.1,
    adults: 40.0,
  },
  {
    code: "CG",
    name: "Chhattisgarh",
    lon: 82.0,
    lat: 21.3,
    prevalence: 39.1,
    adults: 17.0,
  },
  {
    code: "OD",
    name: "Odisha",
    lon: 84.6,
    lat: 20.5,
    prevalence: 42.9,
    adults: 29.0,
  },
  {
    code: "MH",
    name: "Maharashtra",
    lon: 75.7,
    lat: 19.5,
    prevalence: 26.6,
    adults: 76.0,
  },
  {
    code: "TG",
    name: "Telangana",
    lon: 79.0,
    lat: 17.9,
    prevalence: 20.0,
    adults: 25.0,
  },
  {
    code: "AP",
    name: "Andhra Pradesh",
    lon: 80.0,
    lat: 15.9,
    prevalence: 20.0,
    adults: 35.0,
  },
  {
    code: "GA",
    name: "Goa",
    lon: 74.1,
    lat: 15.3,
    prevalence: 9.7,
    adults: 1.1,
  },
  {
    code: "KA",
    name: "Karnataka",
    lon: 76.0,
    lat: 14.8,
    prevalence: 22.8,
    adults: 42.0,
  },
  {
    code: "PY",
    name: "Puducherry",
    lon: 79.83,
    lat: 11.93,
    prevalence: 15.5,
    adults: 0.9,
  },
  {
    code: "TN",
    name: "Tamil Nadu",
    lon: 78.5,
    lat: 11.0,
    prevalence: 20.0,
    adults: 52.0,
  },
  {
    code: "KL",
    name: "Kerala",
    lon: 76.3,
    lat: 10.4,
    prevalence: 12.7,
    adults: 25.0,
  },
];
