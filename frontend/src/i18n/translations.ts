export type Language = "en" | "mr";

export interface Translations {
  appName: string;
  appSubtitle: string;
  loginWelcome: string;
  loginDesc: string;
  enterFullName: string;
  enterPhone: string;
  requestOtp: string;
  sendingOtp: string;
  enterOtp: string;
  otpSentTo: string;
  verifyAndContinue: string;
  verifying: string;
  resendOtp: string;
  dashboard: string;
  history: string;
  adminPanel: string;
  todayAttendance: string;
  scanQrToRecord: string;
  scanQrCode: string;
  nextStep: string;
  eventsCompleted: string;
  allEventsDone: string;
  officeIn: string;
  lunchBreakOut: string;
  lunchBreakIn: string;
  officeOut: string;
  statusNotStarted: string;
  statusCheckedIn: string;
  statusOnLunch: string;
  statusReturnedLunch: string;
  statusCompleted: string;
  logout: string;
  scannerTitle: string;
  scannerHint: string;
  cameraPermissionNeeded: string;
  scanningSuccess: string;
  rapidScanWarning: string;
  close: string;
  present: string;
  absent: string;
  onBreak: string;
  manualCorrection: string;
  reason: string;
  submit: string;
  cancel: string;

  // Contextual messages
  msgNotStarted: string;
  msgCheckedIn: string;
  msgOnLunch: string;
  msgReturnedLunch: string;
  msgCompleted: string;

  // Auth & PIN
  loginTab: string;
  registerTab: string;
  sixDigitPin: string;
  confirmPin: string;
  loginButton: string;
  registerButton: string;
  forgotPin: string;
  showPin: string;
  hidePin: string;
  pinsDoNotMatch: string;
  pinLengthError: string;
  phoneLengthError: string;
  nameRequiredError: string;
  resetPinTitle: string;
  newPin: string;
  resetPinReason: string;
  resetPinSuccess: string;
  resetPinButton: string;

  // Reports
  reportsTitle: string;
  weeklyReport: string;
  monthlyReport: string;
  downloadPdf: string;
  selectDate: string;
  selectMonth: string;
  reportLanguage: string;
  downloading: string;
  reportSuccess: string;
  reportError: string;

  // Search & Filter
  searchStaffPlaceholder: string;
  filterAll: string;
  filterPresent: string;
  filterOnBreak: string;
  filterCompleted: string;
  filterNotStarted: string;
  noStaffFound: string;

  // Super Admin
  superAdminTitle: string;
  superAdminDesc: string;
  superAdminExecutiveHub: string;
  superAdminExecutiveNotice: string;
  superAdminAdminSuiteDesc: string;
  superAdminHistoryDesc: string;
  overview: string;
  staffMember: string;
  currentRole: string;
  action: string;
  assignAdmin: string;
  revokeAdmin: string;
  confirmRoleChange: string;
  roleChangeSuccess: string;

  // Audit Logs & Details
  auditLogsTitle: string;
  viewHistory: string;
  employeeHistory: string;
  noHistoryFound: string;
  editRecord: string;
  newTime: string;
  newEvent: string;
  correctSuccess: string;

  // Physical Presence & GPS
  locationAcquiring: string;
  locationVerifying: string;
  locationPermissionDenied: string;
  locationAccuracyWarning: string;
  locationOutsideGeofence: string;
  locationNotSupported: string;
  locationTimeout: string;
  verifiedDistance: string;
  gpsVerifiedBadge: string;
  manualAdminBadge: string;
  officeLocationSettings: string;
  officeCoordinates: string;
  geofenceRadius: string;

  // Offline & Background Sync
  offlineMode: string;
  offlineGpsReady: string;
  offlineSavedBanner: string;
  offlineSyncPending: string;
  syncNow: string;
  syncing: string;
  syncSuccess: string;
  offlinePendingBadge: string;

  // Static Printed QR & Downloads
  officialOfficeQrTitle: string;
  officialOfficeQrDesc: string;
  downloadHighResPng: string;
  downloadPrintablePdf: string;
  printCounterCard: string;

  // Attendance Scan Feedback (Green / Red Screen)
  scanSuccessTitle: string;
  scanSuccessSubtitle: string;
  scanFailedTitle: string;
  scanFailedSubtitle: string;
  tryAgain: string;
  done: string;
  directGpsCheckIn: string;
  cameraErrorPermission: string;
  cameraErrorNotFound: string;
  gpsErrorPermission: string;
  gpsErrorUnavailable: string;
  outsideGeofenceMessage: string;
  myAttendanceTab: string;
  staffRecordsTab: string;
  staffAttendanceRosterTitle: string;
  deleteStaff: string;
  deleteStaffConfirm: string;
  deleteStaffSuccess: string;
  holdMenuTitle: string;
  holdMenuHint: string;

  // Irregularities & Day Adjustments
  irregularities: string;
  missingCheckout: string;
  dayNotMarked: string;
  incompleteBreak: string;
  allIrregularities: string;
  adjustTiming: string;
  openDaySettings: string;
  noIrregularities: string;
  quickAdjust: string;
  saveAdjustment: string;
  dailyStaffRecords: string;
  addMissingPunch: string;
  correctPunch: string;
  punchType: string;
  time: string;
  auditReason: string;
  adjustmentSuccess: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    appName: "Shivam Patsanstha",
    appSubtitle: "Digital Attendance Management",
    loginWelcome: "Welcome to Shivam Patsanstha",
    loginDesc: "Enter your registered mobile phone number to access your attendance register.",
    enterFullName: "Full Name",
    enterPhone: "Mobile Phone Number",
    requestOtp: "Send Verification Code",
    sendingOtp: "Sending Code...",
    enterOtp: "Enter 6-digit Verification Code",
    otpSentTo: "A code was sent to",
    verifyAndContinue: "Verify & Enter",
    verifying: "Verifying...",
    resendOtp: "Resend Code",
    dashboard: "My Attendance",
    history: "Past Records",
    adminPanel: "Admin Suite",
    todayAttendance: "Today's Attendance",
    scanQrToRecord: "Scan Office QR",
    scanQrCode: "Scan QR",
    nextStep: "Next Action",
    eventsCompleted: "Completed for today",
    allEventsDone: "Daily Attendance Completed",
    officeIn: "Office In",
    lunchBreakOut: "Lunch Break (Out)",
    lunchBreakIn: "Lunch Break (In)",
    officeOut: "Office Out",
    statusNotStarted: "Not Checked In",
    statusCheckedIn: "In Office (Working)",
    statusOnLunch: "On Lunch Break",
    statusReturnedLunch: "Returned to Office",
    statusCompleted: "Day Completed",
    logout: "Log Out",
    scannerTitle: "Office QR Scanner",
    scannerHint: "Point your phone camera at the official QR poster at the office counter.",
    cameraPermissionNeeded: "Please allow camera access to scan the attendance QR code.",
    scanningSuccess: "Attendance recorded successfully!",
    rapidScanWarning: "Please wait a few seconds before scanning again.",
    close: "Close",
    present: "Present",
    absent: "Absent",
    onBreak: "On Lunch Break",
    manualCorrection: "Correct Record",
    reason: "Reason for Adjustment",
    submit: "Submit",
    cancel: "Cancel",

    // Contextual messages
    msgNotStarted: "Welcome! Scan office QR upon arrival.",
    msgCheckedIn: "You're checked in! Have a productive day.",
    msgOnLunch: "Enjoy your lunch break! Scan when you return.",
    msgReturnedLunch: "Welcome back from lunch!",
    msgCompleted: "All 4 scans complete for today. See you tomorrow!",

    // Auth & PIN
    loginTab: "Login",
    registerTab: "Register",
    sixDigitPin: "6-Digit Security PIN",
    confirmPin: "Confirm Security PIN",
    loginButton: "Login",
    registerButton: "Register & Create Account",
    forgotPin: "Forgot PIN? Contact office administrator",
    showPin: "Show PIN",
    hidePin: "Hide PIN",
    pinsDoNotMatch: "PINs do not match. Please verify.",
    pinLengthError: "PIN must be exactly 6 digits.",
    phoneLengthError: "Please enter a valid 10-digit mobile number.",
    nameRequiredError: "Please enter your full name.",
    resetPinTitle: "Reset Employee PIN",
    newPin: "New 6-Digit PIN",
    resetPinReason: "Reason for Reset (Required)",
    resetPinSuccess: "PIN reset successfully!",
    resetPinButton: "Reset PIN",

    // Reports
    reportsTitle: "Attendance Reports",
    weeklyReport: "Weekly Report",
    monthlyReport: "Monthly Report",
    downloadPdf: "Download PDF",
    selectDate: "Select Week Date",
    selectMonth: "Select Month",
    reportLanguage: "Report Language",
    downloading: "Generating PDF...",
    reportSuccess: "Report downloaded successfully!",
    reportError: "Failed to download report. Please try again.",

    // Search & Filter
    searchStaffPlaceholder: "Search staff by name or phone...",
    filterAll: "All Staff",
    filterPresent: "Present",
    filterOnBreak: "On Break",
    filterCompleted: "Completed",
    filterNotStarted: "Not Started",
    noStaffFound: "No staff members match the selected criteria.",

    // Super Admin
    superAdminTitle: "Super Admin Role Management",
    superAdminDesc: "Assign or revoke Admin operational roles for registered staff members.",
    superAdminExecutiveHub: "Super Administrator Hub",
    superAdminExecutiveNotice: "Super Admin privileges active. Personal QR attendance check-in is exempt for this account. You have full executive control over organization attendance, settings, and records.",
    superAdminAdminSuiteDesc: "Manage staff roster, monitor today's attendance, manual corrections, and office location settings.",
    superAdminHistoryDesc: "Inspect staff attendance logs, monthly summaries, and generate official PDF reports.",
    overview: "Overview",
    staffMember: "Staff Member",
    currentRole: "Current Role",
    action: "Action",
    assignAdmin: "Make Admin",
    revokeAdmin: "Revoke Admin",
    confirmRoleChange: "Are you sure you want to change this user's role?",
    roleChangeSuccess: "Role updated successfully!",

    // Audit Logs & Details
    auditLogsTitle: "Administrative Audit Logs",
    viewHistory: "History",
    employeeHistory: "Employee Attendance History",
    noHistoryFound: "No past records found for this employee.",
    editRecord: "Correct Record",
    newTime: "New Time (HH:MM)",
    newEvent: "New Event Type",
    correctSuccess: "Attendance record corrected successfully!",

    // Physical Presence & GPS
    locationAcquiring: "Acquiring GPS location...",
    locationVerifying: "Verifying office proximity...",
    locationPermissionDenied: "Location permission denied. Physical presence verification requires GPS access. Please enable location in your browser settings.",
    locationAccuracyWarning: "GPS accuracy is low. High accuracy (<50m) recommended. Move near a window or open area and retry.",
    locationOutsideGeofence: "Outside office geofence. Attendance can only be recorded within Shivam Patsanstha office premises.",
    locationNotSupported: "Geolocation is not supported by your browser.",
    locationTimeout: "Location request timed out. Please ensure GPS is enabled and try again.",
    verifiedDistance: "Office Distance",
    gpsVerifiedBadge: "GPS Verified",
    manualAdminBadge: "Manual (Admin)",
    officeLocationSettings: "Office Location Settings",
    officeCoordinates: "Office Coordinates",
    geofenceRadius: "Geofence Radius (meters)",

    // Offline & Background Sync
    offlineMode: "Offline Mode",
    offlineGpsReady: "Offline Mode (GPS Active)",
    offlineSavedBanner: "Attendance saved offline! Will automatically sync when internet restores.",
    offlineSyncPending: "offline record(s) queued for sync",
    syncNow: "Sync Now",
    syncing: "Syncing...",
    syncSuccess: "Offline records synced to cloud successfully!",
    offlinePendingBadge: "Offline (Pending Sync)",

    // Static Printed QR & Downloads
    officialOfficeQrTitle: "Official Office Attendance QR",
    officialOfficeQrDesc: "Print and paste this official QR on the office counter or entrance. Attendance is strictly verified by satellite GPS within 50m.",
    downloadHighResPng: "QR (PNG)",
    downloadPrintablePdf: "Poster (PDF)",
    printCounterCard: "Print Standee Now",

    // Attendance Scan Feedback (Green / Red Screen)
    scanSuccessTitle: "Attendance Marked Successfully!",
    scanSuccessSubtitle: "Your presence has been officially verified.",
    scanFailedTitle: "Could Not Mark Attendance",
    scanFailedSubtitle: "Please check the issue below and try again.",
    tryAgain: "Try Again",
    done: "Done",
    directGpsCheckIn: "Direct GPS Check-In",
    cameraErrorPermission: "Camera access blocked. Please allow camera permissions in browser site settings.",
    cameraErrorNotFound: "No camera detected on this device. Please use Direct GPS Check-In.",
    gpsErrorPermission: "Location access denied. Please enable location permissions in browser settings.",
    gpsErrorUnavailable: "Unable to acquire satellite GPS fix. Please ensure location is turned on.",
    outsideGeofenceMessage: "You are outside the 50m office area. Attendance must be logged on office premises.",
    myAttendanceTab: "My Attendance",
    staffRecordsTab: "Staff Records",
    staffAttendanceRosterTitle: "Staff Attendance Records",
    deleteStaff: "Delete Staff Member",
    deleteStaffConfirm: "Are you sure you want to permanently delete this staff member from the database?",
    deleteStaffSuccess: "Staff member permanently deleted from database.",
    holdMenuTitle: "Staff Actions Menu",
    holdMenuHint: "Hold for 3s to manage PIN or Delete",

    // Irregularities & Day Adjustments
    irregularities: "Irregularities",
    missingCheckout: "Missing Check-Out",
    dayNotMarked: "Day Not Marked",
    incompleteBreak: "Incomplete Lunch Break",
    allIrregularities: "All Irregularities",
    adjustTiming: "Adjust Timing",
    openDaySettings: "Open in Records",
    noIrregularities: "No irregularities found! All attendance records are complete.",
    quickAdjust: "Quick Adjust",
    saveAdjustment: "Save Adjustment",
    dailyStaffRecords: "Staff Attendance for this Date",
    addMissingPunch: "Add Missing Punch",
    correctPunch: "Correct Existing Punch",
    punchType: "Punch Event",
    time: "Punch Time",
    auditReason: "Reason for Adjustment",
    adjustmentSuccess: "Attendance adjusted and recalculation saved successfully!",
  },
  mr: {
    appName: "शिवम पतसंस्था",
    appSubtitle: "डिजिटल उपस्थिती व्यवस्थापन प्रणाली",
    loginWelcome: "शिवम पतसंस्थेमध्ये आपले स्वागत आहे",
    loginDesc: "तुमच्या उपस्थिती नोंदवहीत प्रवेश करण्यासाठी तुमचा नोंदणीकृत मोबाइल नंबर प्रविष्ट करा.",
    enterFullName: "पूर्ण नाव",
    enterPhone: "मोबाइल फोन नंबर",
    requestOtp: "पडताळणी कोड पाठवा (OTP)",
    sendingOtp: "कोड पाठवत आहे...",
    enterOtp: "६-अंकी पडताळणी कोड प्रविष्ट करा",
    otpSentTo: "पडताळणी कोड या नंबरवर पाठवला आहे:",
    verifyAndContinue: "सत्यापित करा आणि पुढे जा",
    verifying: "सत्यापित करत आहे...",
    resendOtp: "पुन्हा कोड पाठवा",
    dashboard: "माझी उपस्थिती",
    history: "मागील नोंदी",
    adminPanel: "प्रशासकीय कक्ष",
    todayAttendance: "आजची उपस्थिती",
    scanQrToRecord: "कार्यालयीन QR स्कॅन करा",
    scanQrCode: "QR स्कॅन करा",
    nextStep: "पुढील कृती",
    eventsCompleted: "आजच्या नोंदी पूर्ण झाल्या",
    allEventsDone: "आजचे उपस्थिती चक्र पूर्ण झाले आहे",
    officeIn: "कार्यालय आगमन (Office In)",
    lunchBreakOut: "दुपारचे जेवण (बाहेर)",
    lunchBreakIn: "दुपारचे जेवण (परत)",
    officeOut: "कार्यालय निर्गमन (Office Out)",
    statusNotStarted: "उपस्थिती सुरू झालेली नाही",
    statusCheckedIn: "कार्यालयात उपस्थित (काम चालू)",
    statusOnLunch: "दुपारच्या जेवणाच्या सुट्टीत",
    statusReturnedLunch: "जेवण करून कार्यालयात परत",
    statusCompleted: "आजची उपस्थिती पूर्ण झाली",
    logout: "लॉग आउट करा",
    scannerTitle: "कार्यालय QR स्कॅनर",
    scannerHint: "कार्यालयीन काउंटरवरील अधिकृत QR कोड पोस्टरवर फोनचा कॅमेरा धरा.",
    cameraPermissionNeeded: "उपस्थिती QR कोड स्कॅन करण्यासाठी कॅमेरा परवानगी द्या.",
    scanningSuccess: "उपस्थिती यशस्वीरित्या नोंदवली गेली!",
    rapidScanWarning: "कृपया पुन्हा स्कॅन करण्यापूर्वी काही सेकंद प्रतीक्षा करा.",
    close: "बंद करा",
    present: "उपस्थित",
    absent: "अनुपस्थित",
    onBreak: "जेवणाच्या सुट्टीत",
    manualCorrection: "नोंद दुरुस्त करा",
    reason: "दुरुस्तीचे कारण (अनिवार्य)",
    submit: "जमा करा",
    cancel: "रद्द करा",

    // Contextual messages
    msgNotStarted: "स्वागत आहे! कार्यालयात आल्यावर QR स्कॅन करा.",
    msgCheckedIn: "तुम्ही उपस्थित नोंदवले आहात! चांगला दिवस जावो.",
    msgOnLunch: "दुपारच्या जेवणाचा आनंद घ्या! परत आल्यावर स्कॅन करा.",
    msgReturnedLunch: "जेवणानंतर परत आल्याबद्दल स्वागत!",
    msgCompleted: "आजचे सर्व ४ स्कॅन पूर्ण झाले आहेत. उद्या भेटू!",

    // Auth & PIN
    loginTab: "लॉगिन",
    registerTab: "नवीन नोंदणी",
    sixDigitPin: "६-अंकी सुरक्षा पिन",
    confirmPin: "पिन पुन्हा प्रविष्ट करा",
    loginButton: "लॉगिन करा",
    registerButton: "खाते तयार करा",
    forgotPin: "पिन विसरलात? कार्यालय प्रशासकाशी संपर्क साधा",
    showPin: "पिन दाखवा",
    hidePin: "पिन लपवा",
    pinsDoNotMatch: "पिन जुळत नाहीत. कृपया पुन्हा तपासा.",
    pinLengthError: "पिन नेमका ६ अंकी असावा.",
    phoneLengthError: "कृपया वैध १० अंकी मोबाईल क्रमांक प्रविष्ट करा.",
    nameRequiredError: "कृपया आपले पूर्ण नाव प्रविष्ट करा.",
    resetPinTitle: "कर्मचाऱ्याचा पिन बदला",
    newPin: "नवीन ६-अंकी पिन",
    resetPinReason: "पिन बदलण्याचे कारण (अनिवार्य)",
    resetPinSuccess: "पिन यशस्वीरित्या बदलला गेला!",
    resetPinButton: "पिन बदला",

    // Reports
    reportsTitle: "उपस्थिती अहवाल",
    weeklyReport: "साप्ताहिक अहवाल",
    monthlyReport: "मासिक अहवाल",
    downloadPdf: "PDF डाउनलोड करा",
    selectDate: "आठवड्याची तारीख निवडा",
    selectMonth: "महिना निवडा",
    reportLanguage: "अहवाल भाषा",
    downloading: "PDF तयार करत आहे...",
    reportSuccess: "अहवाल यशस्वीरित्या डाउनलोड झाला!",
    reportError: "अहवाल डाउनलोड करण्यात अयशस्वी. कृपया पुन्हा प्रयत्न करा.",

    // Search & Filter
    searchStaffPlaceholder: "कर्मचाऱ्यांचे नाव किंवा फोन नंबर शोधा...",
    filterAll: "सर्व कर्मचारी",
    filterPresent: "उपस्थित",
    filterOnBreak: "सुट्टीत",
    filterCompleted: "पूर्ण",
    filterNotStarted: "सुरू नाही",
    noStaffFound: "निवडलेल्या निकषांनुसार कर्मचारी आढळले नाहीत.",

    // Super Admin
    superAdminTitle: "सुपर ॲडमिन व्यवस्थापन",
    superAdminDesc: "नोंदणीकृत कर्मचाऱ्यांना प्रशासकीय (Admin) अधिकार द्या किंवा रद्द करा.",
    superAdminExecutiveHub: "सुपर ॲडमिनिस्ट्रेटर केंद्र",
    superAdminExecutiveNotice: "सुपर ॲडमिन विशेषाधिकार सक्रिय. या खात्यासाठी वैयक्तिक QR उपस्थिती नोंदवण्याची आवश्यकता नाही. आपल्याकडे संस्थेचे संपूर्ण प्रशासकीय नियंत्रण आहे.",
    superAdminAdminSuiteDesc: "कर्मचारी यादी, आजची उपस्थिती, रेकॉर्ड दुरुस्ती आणि कार्यालय सेटिंग्ज व्यवस्थापित करा.",
    superAdminHistoryDesc: "कर्मचाऱ्यांचे उपस्थिती नोंदी, मासिक सारांश आणि PDF अहवाल तपासा.",
    overview: "प्रशासन केंद्र",
    staffMember: "कर्मचारी",
    currentRole: "सध्याची भूमिका",
    action: "कृती",
    assignAdmin: "ॲडमिन बनवा",
    revokeAdmin: "ॲडमिन रद्द करा",
    confirmRoleChange: "तुम्हाला खरोखर या वापरकर्त्याची भूमिका बदलायची आहे का?",
    roleChangeSuccess: "भूमिका यशस्वीरित्या बदलली गेली!",

    // Audit Logs & Details
    auditLogsTitle: "प्रशासकीय बदल नोंदवही (Audit Logs)",
    viewHistory: "इतिहास",
    employeeHistory: "कर्मचाऱ्याचा उपस्थिती इतिहास",
    noHistoryFound: "या कर्मचाऱ्यासाठी मागील नोंदी आढळल्या नाहीत.",
    editRecord: "नोंद दुरुस्त करा",
    newTime: "नवीन वेळ (HH:MM)",
    newEvent: "नवीन उपस्थिती प्रकार",
    correctSuccess: "उपस्थिती नोंद यशस्वीरित्या दुरुस्त केली गेली!",

    // Physical Presence & GPS
    locationAcquiring: "जीपीएस स्थान मिळवत आहे...",
    locationVerifying: "कार्यालय अंतर तपासत आहे...",
    locationPermissionDenied: "स्थान परवानगी नाकारली. उपस्थितीसाठी जीपीएस आवश्यक आहे. कृपया ब्राऊझर सेटिंग्जमध्ये स्थान परवानगी सुरू करा.",
    locationAccuracyWarning: "जीपीएस अचूकता कमी आहे. अचूकतेसाठी (<५०मी) मोकळ्या जागेत येऊन पुन्हा प्रयत्न करा.",
    locationOutsideGeofence: "कार्यालय सीमेबाहेर. उपस्थिती फक्त शिवम पतसंस्थेच्या कार्यालयातच नोंदवली जाऊ शकते.",
    locationNotSupported: "तुमचा ब्राऊझर जिओलोकेशनला सपोर्ट करत नाही.",
    locationTimeout: "स्थान मिळवण्याची वेळ संपली. कृपया जीपीएस सुरू असल्याची खात्री करा आणि पुन्हा प्रयत्न करा.",
    verifiedDistance: "कार्यालयापासून अंतर",
    gpsVerifiedBadge: "जीपीएस सत्यापित",
    manualAdminBadge: "मॅन्युअल (अ‍ॅडमिन)",
    officeLocationSettings: "कार्यालय स्थान सेटिंग्ज",
    officeCoordinates: "कार्यालय निर्देशांक",
    geofenceRadius: "जिओफेन्स मर्यादा (मीटर)",

    // Offline & Background Sync
    offlineMode: "ऑफलाइन मोड",
    offlineGpsReady: "ऑफलाइन मोड (GPS सुरू)",
    offlineSavedBanner: "उपस्थिती ऑफलाइन सेव्ह केली! इंटरनेट सुरू झाल्यावर आपोआप सिंक होईल.",
    offlineSyncPending: "ऑफलाइन नोंदी सिंक होणे बाकी",
    syncNow: "आता सिंक करा",
    syncing: "सिंक होत आहे...",
    syncSuccess: "ऑफलाइन नोंदी यशस्वीरित्या सिंक झाल्या!",
    offlinePendingBadge: "ऑफलाइन (सिंक प्रलंबित)",

    // Static Printed QR & Downloads
    officialOfficeQrTitle: "अधिकृत कार्यालयीन उपस्थिती QR कोड",
    officialOfficeQrDesc: "हा अधिकृत QR कोड प्रिंट करून कार्यालयीन काउंटरवर लावा. ५० मीटर आवारातच उपस्थिती वैध ठरेल.",
    downloadHighResPng: "QR (PNG)",
    downloadPrintablePdf: "पोस्टर (PDF)",
    printCounterCard: "आताच प्रिंट करा",

    // Attendance Scan Feedback (Green / Red Screen)
    scanSuccessTitle: "उपस्थिती यशस्वीरित्या नोंदवली!",
    scanSuccessSubtitle: "तुमची उपस्थिती अधिकृतपणे तपासली व नोंदवली गेली आहे.",
    scanFailedTitle: "उपस्थिती नोंदवता आली नाही",
    scanFailedSubtitle: "खालील अडचण तपासा आणि पुन्हा प्रयत्न करा.",
    tryAgain: "पुन्हा प्रयत्न करा",
    done: "पूर्ण झाले",
    directGpsCheckIn: "थेट GPS उपस्थिती",
    cameraErrorPermission: "कॅमेरा परवानगी बंद आहे. कृपया ब्राऊझर सेटिंग्जमध्ये जाऊन परवानगी द्या.",
    cameraErrorNotFound: "या फोनवर कॅमेरा सापडला नाही. थेट GPS उपस्थिती पर्याय वापरा.",
    gpsErrorPermission: "स्थान (GPS) परवानगी बंद आहे. कृपया ब्राऊझर सेटिंग्जमध्ये लोकेशन सुरू करा.",
    gpsErrorUnavailable: "GPS सिग्नल मिळू शकला नाही. कृपया फोनचे लोकेशन (GPS) चालू करा.",
    outsideGeofenceMessage: "तुम्ही कार्यालयाच्या ५० मीटर आवाराबाहेर आहात. उपस्थिती केवळ शिवम पतसंस्था कार्यालयातच नोंदवता येईल.",
    myAttendanceTab: "माझी उपस्थिती",
    staffRecordsTab: "कर्मचारी नोंदी",
    staffAttendanceRosterTitle: "कर्मचारी उपस्थिती नोंदी",
    deleteStaff: "कर्मचारी खाते हटवा",
    deleteStaffConfirm: "तुम्ही या कर्मचाऱ्याचे खाते कायमस्वरूपी डेटाबेसमधून हटवू इच्छिता का?",
    deleteStaffSuccess: "कर्मचारी खाते डेटाबेसमधून हटवले गेले.",
    holdMenuTitle: "कर्मचारी व्यवस्थापन पर्याय",
    holdMenuHint: "पिन रीसेट किंवा हटवण्यासाठी ३ सेकंद दाबून धरा",

    // Irregularities & Day Adjustments
    irregularities: "अनियमितता",
    missingCheckout: "निर्गमन नोंद नाही (Check-Out विसरले)",
    dayNotMarked: "दिवसाची हजेरी नोंद नाही (गैरहजर)",
    incompleteBreak: "जेवण ब्रेक अपूर्ण (परत नोंद नाही)",
    allIrregularities: "सर्व अनियमितता",
    adjustTiming: "वेळ बदला / हजेरी नोंदवा",
    openDaySettings: "नोंदवहीत दुरुस्त करा",
    noIrregularities: "कोणतीही अनियमितता नाही! सर्व हजेरी नोंदी पूर्ण आहेत.",
    quickAdjust: "त्वरित बदल",
    saveAdjustment: "बदल जतन करा",
    dailyStaffRecords: "या दिवसाची कर्मचारी हजेरी",
    addMissingPunch: "नसलेली नोंद समाविष्ट करा",
    correctPunch: "हजेरी वेळ दुरुस्त करा",
    punchType: "नोंदीचा प्रकार",
    time: "वेळ",
    auditReason: "बदलाचे कारण",
    adjustmentSuccess: "हजेरी वेळ यशस्वीरीत्या अद्ययावत केली गेली!",
  },
};
