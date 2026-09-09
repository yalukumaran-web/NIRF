/**
 * OFFICIAL NIRF 2025 Engineering ranking ground truth.
 *
 * Source: https://www.nirfindia.org/Rankings/2025/EngineeringRanking.html
 * Retrieved: 2026-09-06 (official Ministry of Education / NIRF portal).
 *
 * This is the reference target set used to:
 *   - label the supervised learning dataset (official score & rank targets)
 *   - verify the application's official-methodology calculations (see
 *     server/src/scripts/verifyEngine.ts)
 *   - render the Top-90 comparison page
 *
 * Scores are exactly as published by NIRF (engineering category, 2025).
 */
export interface OfficialEngineeringScore {
  rank: number;
  instituteId: string;
  instituteName: string;
  score: number;
  tlr: number;
  rpc: number;
  go: number;
  oi: number;
  pr: number;
}

export const OFFICIAL_ENGINEERING_2025: OfficialEngineeringScore[] = [
  { rank: 1, instituteId: "IR-E-U-0456", instituteName: "Indian Institute of Technology Madras", score: 88.72, tlr: 95.70, rpc: 90.74, go: 82.29, oi: 63.25, pr: 100.00 },
  { rank: 2, instituteId: "IR-E-I-1074", instituteName: "Indian Institute of Technology Delhi", score: 85.74, tlr: 85.89, rpc: 93.47, go: 81.67, oi: 62.01, pr: 93.97 },
  { rank: 3, instituteId: "IR-E-U-0306", instituteName: "Indian Institute of Technology Bombay", score: 83.65, tlr: 87.97, rpc: 84.81, go: 87.06, oi: 59.13, pr: 85.04 },
  { rank: 4, instituteId: "IR-E-I-1075", instituteName: "Indian Institute of Technology Kanpur", score: 81.82, tlr: 91.77, rpc: 76.34, go: 88.08, oi: 59.18, pr: 78.49 },
  { rank: 5, instituteId: "IR-E-U-0573", instituteName: "Indian Institute of Technology Kharagpur", score: 78.69, tlr: 85.26, rpc: 77.56, go: 79.82, oi: 64.24, pr: 74.57 },
  { rank: 6, instituteId: "IR-E-U-0560", instituteName: "Indian Institute of Technology Roorkee", score: 75.44, tlr: 76.06, rpc: 76.57, go: 85.82, oi: 63.92, pr: 60.98 },
  { rank: 7, instituteId: "IR-E-U-0013", instituteName: "Indian Institute of Technology Hyderabad", score: 72.31, tlr: 88.02, rpc: 61.39, go: 79.20, oi: 54.39, pr: 61.98 },
  { rank: 8, instituteId: "IR-E-U-0053", instituteName: "Indian Institute of Technology Guwahati", score: 72.24, tlr: 73.60, rpc: 72.89, go: 84.68, oi: 61.40, pr: 52.06 },
  { rank: 9, instituteId: "IR-E-U-0467", instituteName: "National Institute of Technology Tiruchirappalli", score: 68.14, tlr: 73.26, rpc: 57.64, go: 78.69, oi: 64.76, pr: 66.54 },
  { rank: 10, instituteId: "IR-E-U-0701", instituteName: "Indian Institute of Technology (BHU) Varanasi", score: 67.24, tlr: 66.39, rpc: 61.68, go: 86.03, oi: 60.51, pr: 55.64 },
  { rank: 11, instituteId: "IR-E-U-0391", instituteName: "Birla Institute of Technology & Science - Pilani", score: 67.02, tlr: 82.07, rpc: 56.41, go: 81.04, oi: 60.41, pr: 32.29 },
  { rank: 12, instituteId: "IR-E-U-0273", instituteName: "Indian Institute of Technology Indore", score: 66.65, tlr: 81.25, rpc: 59.55, go: 76.52, oi: 63.77, pr: 27.15 },
  { rank: 13, instituteId: "IR-E-U-0357", instituteName: "National Institute of Technology Rourkela", score: 66.62, tlr: 83.55, rpc: 59.25, go: 76.89, oi: 61.74, pr: 22.37 },
  { rank: 14, instituteId: "IR-E-U-0473", instituteName: "S.R.M. Institute of Science and Technology", score: 65.83, tlr: 78.69, rpc: 68.93, go: 65.43, oi: 67.09, pr: 17.45 },
  { rank: 15, instituteId: "IR-E-U-0205", instituteName: "Indian Institute of Technology (Indian School of Mines) Dhanbad", score: 65.37, tlr: 72.84, rpc: 62.49, go: 77.02, oi: 61.36, pr: 32.29 },
  { rank: 16, instituteId: "IR-E-U-0490", instituteName: "Vellore Institute of Technology", score: 65.25, tlr: 66.77, rpc: 67.60, go: 72.22, oi: 61.01, pr: 43.97 },
  { rank: 17, instituteId: "IR-E-U-0237", instituteName: "National Institute of Technology Karnataka, Surathkal", score: 64.59, tlr: 75.38, rpc: 51.80, go: 78.11, oi: 62.49, pr: 45.70 },
  { rank: 18, instituteId: "IR-E-U-0575", instituteName: "Jadavpur University", score: 64.54, tlr: 79.56, rpc: 59.41, go: 71.46, oi: 48.60, pr: 37.00 },
  { rank: 19, instituteId: "IR-E-U-0064", instituteName: "Indian Institute of Technology Patna", score: 64.52, tlr: 79.24, rpc: 55.04, go: 78.40, oi: 63.95, pr: 21.73 },
  { rank: 20, instituteId: "IR-E-U-0439", instituteName: "Anna University", score: 63.51, tlr: 69.43, rpc: 62.80, go: 63.28, oi: 51.12, pr: 60.73 },
  { rank: 21, instituteId: "IR-E-U-0263", instituteName: "National Institute of Technology Calicut", score: 63.05, tlr: 83.65, rpc: 40.00, go: 79.12, oi: 66.66, pr: 34.71 },
  { rank: 22, instituteId: "IR-E-U-0363", instituteName: "Siksha O Anusandhan", score: 62.58, tlr: 85.34, rpc: 43.83, go: 70.48, oi: 73.26, pr: 24.03 },
  { rank: 23, instituteId: "IR-E-U-0436", instituteName: "Amrita Vishwa Vidyapeetham", score: 62.46, tlr: 80.74, rpc: 51.78, go: 67.71, oi: 64.19, pr: 27.53 },
  { rank: 24, instituteId: "IR-E-U-0108", instituteName: "Jamia Millia Islamia", score: 62.42, tlr: 67.50, rpc: 59.18, go: 78.28, oi: 67.19, pr: 20.43 },
  { rank: 25, instituteId: "IR-E-U-0139", instituteName: "Indian Institute of Technology Gandhinagar", score: 62.31, tlr: 85.82, rpc: 41.07, go: 74.62, oi: 63.82, pr: 29.36 },
  { rank: 26, instituteId: "IR-E-U-0184", instituteName: "Indian Institute of Technology Mandi", score: 62.08, tlr: 81.90, rpc: 42.61, go: 78.29, oi: 68.77, pr: 21.95 },
  { rank: 27, instituteId: "IR-E-U-0395", instituteName: "Indian Institute of Technology Jodhpur", score: 61.31, tlr: 86.92, rpc: 44.03, go: 70.43, oi: 66.41, pr: 12.93 },
  { rank: 28, instituteId: "IR-E-U-0025", instituteName: "National Institute of Technology Warangal", score: 61.05, tlr: 74.94, rpc: 49.23, go: 73.64, oi: 57.32, pr: 33.44 },
  { rank: 29, instituteId: "IR-E-I-1480", instituteName: "Thapar Institute of Engineering and Technology", score: 60.97, tlr: 75.12, rpc: 50.86, go: 73.27, oi: 65.68, pr: 19.53 },
  { rank: 30, instituteId: "IR-E-U-0098", instituteName: "Delhi Technological University", score: 60.85, tlr: 73.01, rpc: 46.71, go: 79.17, oi: 54.82, pr: 36.25 },
  { rank: 31, instituteId: "IR-E-U-0747", instituteName: "Chandigarh University", score: 60.46, tlr: 73.26, rpc: 57.93, go: 59.17, oi: 74.33, pr: 18.39 },
  { rank: 32, instituteId: "IR-E-U-0378", instituteName: "Indian Institute of Technology Ropar", score: 59.66, tlr: 72.46, rpc: 47.74, go: 75.18, oi: 60.41, pr: 25.23 },
  { rank: 33, instituteId: "IR-E-U-0458", instituteName: "Kalasalingam Academy of Research and Education", score: 59.03, tlr: 78.03, rpc: 42.46, go: 72.16, oi: 77.18, pr: 7.27 },
  { rank: 34, instituteId: "IR-E-U-0496", instituteName: "Aligarh Muslim University", score: 59.01, tlr: 76.86, rpc: 55.65, go: 64.17, oi: 41.19, pr: 23.00 },
  { rank: 35, instituteId: "IR-E-U-0020", instituteName: "Koneru Lakshmaiah Education Foundation University", score: 58.95, tlr: 77.55, rpc: 48.67, go: 69.94, oi: 66.84, pr: 4.12 },
  { rank: 36, instituteId: "IR-E-U-0356", instituteName: "Kalinga Institute of Industrial Technology", score: 58.79, tlr: 78.64, rpc: 47.76, go: 60.32, oi: 77.29, pr: 10.76 },
  { rank: 37, instituteId: "IR-E-U-0497", instituteName: "Amity University", score: 58.53, tlr: 66.68, rpc: 65.39, go: 62.04, oi: 59.02, pr: 6.04 },
  { rank: 38, instituteId: "IR-E-U-0014", instituteName: "International Institute of Information Technology Hyderabad", score: 58.45, tlr: 75.84, rpc: 43.22, go: 70.72, oi: 63.32, pr: 22.58 },
  { rank: 39, instituteId: "IR-E-U-0355", instituteName: "Indian Institute of Technology Bhubaneswar", score: 58.22, tlr: 74.57, rpc: 39.14, go: 75.07, oi: 62.69, pr: 28.27 },
  { rank: 40, instituteId: "IR-E-U-0476", instituteName: "Shanmugha Arts Science Technology & Research Academy (SASTRA)", score: 58.02, tlr: 80.47, rpc: 35.94, go: 73.70, oi: 72.80, pr: 10.76 },
  { rank: 41, instituteId: "IR-E-U-0308", instituteName: "Institute of Chemical Technology", score: 57.96, tlr: 76.35, rpc: 50.35, go: 64.94, oi: 53.35, pr: 16.24 },
  { rank: 42, instituteId: "IR-E-U-0410", instituteName: "Malaviya National Institute of Technology", score: 57.45, tlr: 69.29, rpc: 51.84, go: 70.23, oi: 60.14, pr: 10.48 },
  { rank: 43, instituteId: "IR-E-U-0564", instituteName: "UPES", score: 56.99, tlr: 71.34, rpc: 55.50, go: 54.26, oi: 62.65, pr: 18.16 },
  { rank: 44, instituteId: "IR-E-U-0334", instituteName: "Visvesvaraya National Institute of Technology, Nagpur", score: 56.58, tlr: 71.55, rpc: 44.33, go: 71.94, oi: 56.04, pr: 18.16 },
  { rank: 45, instituteId: "IR-E-I-1441", instituteName: "Saveetha Institute of Medical and Technical Sciences", score: 56.55, tlr: 75.77, rpc: 61.58, go: 40.58, oi: 71.22, pr: 1.07 },
  { rank: 46, instituteId: "IR-E-U-0329", instituteName: "Symbiosis International", score: 56.22, tlr: 69.68, rpc: 51.85, go: 65.38, oi: 54.68, pr: 12.13 },
  { rank: 47, instituteId: "IR-E-C-16604", instituteName: "Sri Sivasubramaniya Nadar College of Engineering", score: 56.08, tlr: 71.29, rpc: 43.96, go: 70.01, oi: 57.78, pr: 17.21 },
  { rank: 48, instituteId: "IR-E-U-0379", instituteName: "Lovely Professional University", score: 55.99, tlr: 63.04, rpc: 52.88, go: 62.53, oi: 66.88, pr: 20.21 },
  { rank: 49, instituteId: "IR-E-U-0577", instituteName: "National Institute of Technology Durgapur", score: 55.94, tlr: 71.25, rpc: 38.14, go: 77.92, oi: 58.39, pr: 16.97 },
  { rank: 50, instituteId: "IR-E-U-0055", instituteName: "National Institute of Technology Silchar", score: 55.91, tlr: 66.60, rpc: 51.48, go: 70.15, oi: 54.71, pr: 9.92 },
  { rank: 51, instituteId: "IR-E-U-0202", instituteName: "Birla Institute of Technology, Mesra", score: 55.28, tlr: 76.22, rpc: 40.21, go: 66.03, oi: 52.07, pr: 19.31 },
  { rank: 52, instituteId: "IR-E-U-0555", instituteName: "Graphic Era University", score: 55.26, tlr: 68.63, rpc: 55.33, go: 47.50, oi: 58.38, pr: 27.34 },
  { rank: 53, instituteId: "IR-E-U-0072", instituteName: "National Institute of Technology Patna", score: 53.89, tlr: 58.95, rpc: 51.69, go: 73.81, oi: 53.01, pr: 6.35 },
  { rank: 54, instituteId: "IR-E-U-0584", instituteName: "Indian Institute of Engineering Science and Technology, Shibpur", score: 53.63, tlr: 66.32, rpc: 37.75, go: 70.93, oi: 52.44, pr: 29.71 },
  { rank: 55, instituteId: "IR-E-U-0374", instituteName: "Dr B R Ambedkar National Institute of Technology, Jalandhar", score: 53.38, tlr: 71.26, rpc: 40.49, go: 61.88, oi: 62.76, pr: 11.86 },
  { rank: 56, instituteId: "IR-E-U-0906", instituteName: "Indian Institute of Technology Jammu", score: 53.08, tlr: 80.73, rpc: 31.90, go: 60.05, oi: 57.78, pr: 15.00 },
  { rank: 57, instituteId: "IR-E-U-0844", instituteName: "Indian Institute of Technology, Tirupati", score: 52.73, tlr: 81.96, rpc: 22.84, go: 66.17, oi: 54.00, pr: 26.59 },
  { rank: 58, instituteId: "IR-E-U-0749", instituteName: "Manipal University Jaipur", score: 52.69, tlr: 71.67, rpc: 40.11, go: 58.63, oi: 69.16, pr: 5.09 },
  { rank: 59, instituteId: "IR-E-C-7252", instituteName: "Manipal Institute of Technology", score: 52.55, tlr: 68.27, rpc: 41.71, go: 60.77, oi: 58.59, pr: 15.50 },
  { rank: 60, instituteId: "IR-E-U-0739", instituteName: "Madan Mohan Malaviya University of Technology", score: 52.45, tlr: 76.52, rpc: 24.75, go: 68.59, oi: 71.41, pr: 12.13 },
  { rank: 61, instituteId: "IR-E-U-0255", instituteName: "Indian Institute of Space Science and Technology", score: 52.44, tlr: 75.88, rpc: 25.19, go: 66.94, oi: 60.04, pr: 27.34 },
  { rank: 62, instituteId: "IR-E-U-0530", instituteName: "Motilal Nehru National Institute of Technology", score: 52.15, tlr: 63.15, rpc: 37.51, go: 74.36, oi: 55.38, pr: 15.50 },
  { rank: 63, instituteId: "IR-E-U-0105", instituteName: "Indraprastha Institute of Information Technology", score: 51.33, tlr: 66.46, rpc: 30.17, go: 73.74, oi: 52.74, pr: 23.21 },
  { rank: 64, instituteId: "IR-E-U-0878", instituteName: "Indian Institute of Technology Palakkad", score: 51.20, tlr: 74.28, rpc: 26.02, go: 62.17, oi: 65.91, pr: 20.87 },
  { rank: 65, instituteId: "IR-E-U-0622", instituteName: "National Institute of Technology Delhi", score: 50.79, tlr: 62.76, rpc: 29.35, go: 71.26, oi: 69.51, pr: 19.53 },
  { rank: 66, instituteId: "IR-E-U-0149", instituteName: "Sardar Vallabhbhai National Institute of Technology", score: 50.77, tlr: 62.42, rpc: 42.99, go: 62.65, oi: 54.21, pr: 11.86 },
  { rank: 67, instituteId: "IR-E-U-0474", instituteName: "Sathyabama Institute of Science and Technology", score: 50.64, tlr: 70.44, rpc: 36.38, go: 51.69, oi: 71.85, pr: 10.76 },
  { rank: 67, instituteId: "IR-E-C-37013", instituteName: "PSG College of Technology", score: 50.64, tlr: 70.17, rpc: 26.31, go: 60.36, oi: 47.52, pr: 48.83 },
  { rank: 69, instituteId: "IR-E-U-0221", instituteName: "International Institute of Information Technology Bangalore", score: 50.46, tlr: 68.33, rpc: 24.19, go: 71.27, oi: 59.94, pr: 24.63 },
  { rank: 70, instituteId: "IR-E-C-6379", instituteName: "Netaji Subhas University of Technology", score: 50.43, tlr: 68.09, rpc: 27.14, go: 73.77, oi: 51.97, pr: 19.08 },
  { rank: 71, instituteId: "IR-E-U-0389", instituteName: "Banasthali Vidyapith", score: 50.38, tlr: 70.41, rpc: 24.74, go: 71.47, oi: 71.39, pr: 4.12 },
  { rank: 72, instituteId: "IR-E-U-0946", instituteName: "Indian Institute of Technology Bhilai", score: 50.37, tlr: 76.99, rpc: 24.97, go: 65.13, oi: 59.02, pr: 8.47 },
  { rank: 73, instituteId: "IR-E-U-0197", instituteName: "National Institute of Technology Srinagar", score: 50.23, tlr: 62.39, rpc: 35.08, go: 69.97, oi: 64.33, pr: 5.73 },
  { rank: 74, instituteId: "IR-E-U-0042", instituteName: "University of Hyderabad", score: 49.36, tlr: 66.49, rpc: 50.21, go: 43.44, oi: 48.99, pr: 7.57 },
  { rank: 75, instituteId: "IR-E-C-1331", instituteName: "M S Ramaiah Institute of Technology", score: 49.26, tlr: 70.38, rpc: 28.02, go: 62.77, oi: 56.51, pr: 15.50 },
  { rank: 76, instituteId: "IR-E-U-0217", instituteName: "Christ University", score: 49.03, tlr: 65.63, rpc: 47.28, go: 34.52, oi: 63.03, pr: 19.53 },
  { rank: 77, instituteId: "IR-E-U-0899", instituteName: "Indian Institute of Technology Dharwad", score: 48.61, tlr: 74.99, rpc: 17.71, go: 63.79, oi: 57.85, pr: 22.58 },
  { rank: 78, instituteId: "IR-E-U-0535", instituteName: "Rajiv Gandhi Institute of Petroleum Technology", score: 48.52, tlr: 77.78, rpc: 20.12, go: 67.42, oi: 55.98, pr: 0.72 },
  { rank: 79, instituteId: "IR-E-U-0384", instituteName: "Sant Longowal Institute of Engineering & Technology", score: 48.42, tlr: 78.11, rpc: 26.83, go: 51.16, oi: 66.44, pr: 0.72 },
  { rank: 80, instituteId: "IR-E-U-0043", instituteName: "Vignan's Foundation for Science, Technology and Research", score: 48.27, tlr: 71.70, rpc: 21.52, go: 58.20, oi: 69.39, pr: 17.21 },
  { rank: 81, instituteId: "IR-E-U-0284", instituteName: "Maulana Azad National Institute of Technology", score: 48.26, tlr: 54.74, rpc: 36.36, go: 73.26, oi: 52.93, pr: 9.92 },
  { rank: 82, instituteId: "IR-E-U-0207", instituteName: "National Institute of Technology, Jamshedpur", score: 48.25, tlr: 59.72, rpc: 28.90, go: 75.79, oi: 58.58, pr: 6.35 },
  { rank: 83, instituteId: "IR-E-U-0619", instituteName: "National Institute of Technology Meghalaya", score: 48.21, tlr: 66.48, rpc: 30.77, go: 62.31, oi: 58.46, pr: 7.27 },
  { rank: 84, instituteId: "IR-E-U-0223", instituteName: "Jain University, Bangalore", score: 48.01, tlr: 68.49, rpc: 40.87, go: 42.99, oi: 62.18, pr: 3.79 },
  { rank: 85, instituteId: "IR-E-U-0172", instituteName: "National Institute of Technology Kurukshetra", score: 47.98, tlr: 53.75, rpc: 37.48, go: 66.64, oi: 55.43, pr: 17.45 },
  { rank: 86, instituteId: "IR-E-U-0092", instituteName: "National Institute of Technology, Raipur", score: 47.59, tlr: 54.86, rpc: 39.87, go: 66.26, oi: 54.45, pr: 4.77 },
  { rank: 87, instituteId: "IR-E-U-0489", instituteName: "Vel Tech Rangarajan Dr. Sagunthala R & D Institute of Science and Technology", score: 47.43, tlr: 66.71, rpc: 35.76, go: 46.01, oi: 67.33, pr: 7.57 },
  { rank: 88, instituteId: "IR-E-C-24004", instituteName: "AU College of Engineering", score: 47.37, tlr: 76.16, rpc: 13.15, go: 61.81, oi: 78.27, pr: 3.79 },
  { rank: 89, instituteId: "IR-E-U-0373", instituteName: "Chitkara University", score: 47.34, tlr: 50.97, rpc: 49.46, go: 51.93, oi: 62.79, pr: 5.41 },
  { rank: 90, instituteId: "IR-E-U-1257", instituteName: "COEP Technological University", score: 47.31, tlr: 61.16, rpc: 24.82, go: 67.69, oi: 50.90, pr: 28.82 },
];