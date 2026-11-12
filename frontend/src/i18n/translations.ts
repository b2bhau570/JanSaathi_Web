/**
 * Jan Saathi AI — Comprehensive Trilingual Translations (EN / HI / OR)
 * Pure client-side dictionary for open patient intake and clinical interview.
 */

export type SupportedLanguage =
  | 'or' | 'hi' | 'en' | 'bn' | 'te' | 'ta' | 'mr' | 'gu'
  | 'kn' | 'ml' | 'pa' | 'as' | 'ur' | 'ne' | 'sa' | 'mai'
  | 'kok' | 'sd' | 'doi' | 'mni' | 'sat' | 'brx' | 'ks';

export interface TranslationDictionary {
  // Navigation & Common
  appName: string;
  appSubtitle: string;
  emergencyNotice: string;
  emergencyWarning: string;
  emergencyCall: string;
  checkExistingCase: string;
  selectLanguage: string;
  stepOf: string;
  next: string;
  back: string;
  submit: string;
  submitting: string;
  cancel: string;
  save: string;
  confirm: string;
  edit: string;
  clear: string;
  close: string;
  optional: string;
  required: string;

  // Step 1: Personal Info
  personalInfoTitle: string;
  personalInfoSubtitle: string;
  fullNameLabel: string;
  fullNamePlaceholder: string;
  ageLabel: string;
  agePlaceholder: string;
  genderLabel: string;
  genderMale: string;
  genderFemale: string;
  genderOther: string;
  genderPreferNot: string;
  contactLabel: string;
  contactPlaceholder: string;
  contactHelp: string;

  // Step 2: Chief Complaint
  chiefComplaintTitle: string;
  chiefComplaintSubtitle: string;
  complaintLabel: string;
  complaintPlaceholder: string;
  durationLabel: string;
  durationPlaceholder: string;
  severityLabel: string;
  severityMild: string;
  severityModerate: string;
  severitySevere: string;

  // Step 3: Medical History
  medicalHistoryTitle: string;
  medicalHistorySubtitle: string;
  conditionsLabel: string;
  conditionsPlaceholder: string;
  allergiesLabel: string;
  allergiesPlaceholder: string;
  medicationsLabel: string;
  medicationsPlaceholder: string;

  // Step 4: AI Clinical Interview & Voice
  interviewTitle: string;
  interviewSubtitle: string;
  interviewDisclaimer: string;
  yourAnswerLabel: string;
  yourAnswerPlaceholder: string;
  submitAnswer: string;
  duplicatePrevented: string;
  loadingQuestions: string;
  noQuestionsLeft: string;

  // Voice Assistant
  voiceAssistantTitle: string;
  voiceModeSimulated: string;
  voiceModeBrowser: string;
  voiceModeText: string;
  voicePrivacyNotice: string;
  voiceBrowserUnsupported: string;
  voiceMicPermissionDenied: string;
  voiceStatusIdle: string;
  voiceStatusSpeaking: string;
  voiceStatusListening: string;
  voiceStatusReviewing: string;
  voiceStatusProcessing: string;
  voiceStatusPaused: string;
  voiceStatusCompleted: string;
  speakQuestionBtn: string;
  repeatQuestionBtn: string;
  startSpeakingBtn: string;
  stopListeningBtn: string;
  pauseBtn: string;
  resumeBtn: string;
  resetSessionBtn: string;
  confirmTranscriptBtn: string;
  scenarioSelectLabel: string;
  scenarioRoutine: string;
  scenarioChestPain: string;
  scenarioBreathing: string;
  scenarioFever: string;
  scenarioHeadache: string;
  scenarioCough: string;
  scenarioAbdominal: string;
  scenarioGastro: string;
  scenarioDizziness: string;
  scenarioInjury: string;
  startVoiceIntake: string;
  voiceIntakeNav: string;
  dictateComplaint: string;
  jumpToVoice: string;
  autoAgentMode: string;
  startAutoAgentBtn: string;
  pauseAutoAgentBtn: string;
  resumeAutoAgentBtn: string;
  stopAutoAgentBtn: string;
  autoAgentDesc: string;
  autoAdvancingIn: string;

  // Step 5: Documents
  documentUploadTitle: string;
  documentUploadSubtitle: string;
  uploadFileLabel: string;
  fileSelected: string;
  noFileSelected: string;

  // Step 6: Review & Submit
  reviewTitle: string;
  reviewSubtitle: string;
  reviewSummaryHeading: string;
  readyToSubmit: string;
  disclaimerAgreement: string;

  // Completion
  completeTitle: string;
  completeSubtitle: string;
  publicCaseIdLabel: string;
  accessTokenLabel: string;
  tokenSaveWarning: string;
  downloadReceiptBtn: string;

  // Step 6: Vitals & Sensors
  vitalsTitle: string;
  vitalsSubtitle: string;
  sensorGuidance: string;
  heartRateLabel: string;
  bloodOxygenLabel: string;
  bloodPressureLabel: string;
  temperatureLabel: string;
  sensorConnected: string;
  noReportsVoicePrompt: string;
  iDontHaveReportsBtn: string;
  allStepsVoiceTitle: string;
  transcribingSpeech: string;
  generatingQuestions: string;
  readingTelemetry: string;
  submittingToDoctor: string;
  speechNotCaptured: string;
  doneSpeaking: string;
}

export const translations: Record<string, TranslationDictionary> = {
  en: {
    appName: 'Jan Saathi AI',
    appSubtitle: 'Public Healthcare Intake & Assistance Platform',
    emergencyNotice: 'Emergency Warning:',
    emergencyWarning:
      'If you are experiencing severe chest pain, breathing difficulty, sudden weakness, or profuse bleeding, immediately call 112 / 108 or go to the nearest emergency room.',
    emergencyCall: 'Emergency Hotline: 112 / 108',
    checkExistingCase: 'Check Existing Case Status',
    selectLanguage: 'Language / भाषा / ଭାଷା',
    stepOf: 'Step {current} of {total}',
    next: 'Continue',
    back: 'Back',
    submit: 'Submit Health Assessment',
    submitting: 'Submitting Assessment...',
    cancel: 'Cancel',
    save: 'Save',
    confirm: 'Confirm & Continue',
    edit: 'Edit Answer',
    clear: 'Clear',
    close: 'Close',
    optional: 'Optional',
    required: 'Required',

    personalInfoTitle: 'Personal Information',
    personalInfoSubtitle: 'No account or login required. You will receive a secure case access token upon submission.',
    fullNameLabel: 'Full Name / Identifier',
    fullNamePlaceholder: 'e.g. Ramesh Kumar',
    ageLabel: 'Age (Years)',
    agePlaceholder: 'e.g. 45',
    genderLabel: 'Gender',
    genderMale: 'Male',
    genderFemale: 'Female',
    genderOther: 'Other',
    genderPreferNot: 'Prefer not to say',
    contactLabel: 'Contact Phone Number (Optional)',
    contactPlaceholder: '10-digit mobile number',
    contactHelp: 'Used only by hospital staff if urgent case clarification is needed.',

    chiefComplaintTitle: 'Health Concern & Symptoms',
    chiefComplaintSubtitle: 'Please describe your main health issue in your own words.',
    complaintLabel: 'What is your primary health concern?',
    complaintPlaceholder: 'e.g. Severe headache and fever for the past 2 days...',
    durationLabel: 'How long have you had this issue?',
    durationPlaceholder: 'e.g. 2 days, 3 weeks, since this morning',
    severityLabel: 'How severe are your symptoms right now?',
    severityMild: 'Mild (Noticeable but does not disrupt daily routine)',
    severityModerate: 'Moderate (Uncomfortable and limits some normal activities)',
    severitySevere: 'Severe (Intense distress or prevents routine function)',

    medicalHistoryTitle: 'Medical History & Allergies',
    medicalHistorySubtitle: 'Providing health history helps clinicians assess your case safely.',
    conditionsLabel: 'Existing Health Conditions (Optional)',
    conditionsPlaceholder: 'e.g. Diabetes, Hypertension, Asthma, Thyroid (or None)',
    allergiesLabel: 'Known Drug or Food Allergies (Optional)',
    allergiesPlaceholder: 'e.g. Penicillin, Sulfa drugs, Peanuts (or None)',
    medicationsLabel: 'Current Medications (Optional)',
    medicationsPlaceholder: 'e.g. Metformin 500mg, Amlodipine 5mg (or None)',

    interviewTitle: 'Clinical Intake Interview',
    interviewSubtitle: 'Our automated system asks follow-up questions tailored to your symptoms.',
    interviewDisclaimer:
      'AI-ASSISTED PROTOCOL — These follow-up questions are generated by automated rules to organize your case for a qualified doctor. They do not constitute medical advice or a diagnosis.',
    yourAnswerLabel: 'Your Response:',
    yourAnswerPlaceholder: 'Type your answer or speak using the voice controls...',
    submitAnswer: 'Save & Next Question',
    duplicatePrevented: 'Duplicate question filtered out.',
    loadingQuestions: 'Analyzing your responses and preparing follow-up...',
    noQuestionsLeft: 'All follow-up questions answered. You may proceed to document upload.',

    voiceAssistantTitle: 'Multilingual Voice Assistant',
    voiceModeSimulated: 'Mode A: Simulated Demo',
    voiceModeBrowser: 'Mode B: Browser Voice',
    voiceModeText: 'Mode C: Text Only',
    voicePrivacyNotice:
      'Voice recognition runs locally in your browser. No voice audio is sent to external cloud AI or paid APIs. You can inspect and edit every spoken transcript before final submission.',
    voiceBrowserUnsupported:
      'Web Speech API is not supported in this browser. You can use Mode A (Simulated Voice Demo) or Mode C (Text-Only).',
    voiceMicPermissionDenied:
      'Microphone access was denied. Please allow microphone permissions in your browser or switch to Mode A / Mode C.',
    voiceStatusIdle: 'Ready',
    voiceStatusSpeaking: 'Assistant Speaking...',
    voiceStatusListening: 'Listening to your voice...',
    voiceStatusReviewing: 'Review Spoken Transcript',
    voiceStatusProcessing: 'Processing Answer...',
    voiceStatusPaused: 'Interview Paused',
    voiceStatusCompleted: 'Interview Complete',
    speakQuestionBtn: 'Speak Question',
    repeatQuestionBtn: 'Repeat Question',
    startSpeakingBtn: 'Speak Answer',
    stopListeningBtn: 'Stop Listening',
    pauseBtn: 'Pause Assistant',
    resumeBtn: 'Resume Assistant',
    resetSessionBtn: 'Reset Voice Session',
    confirmTranscriptBtn: 'Accept Spoken Answer',
    scenarioSelectLabel: 'Select Test Scenario (Simulation Mode):',
    scenarioRoutine: '1. Routine: Mild Skin Itch / Rash (Normal)',
    scenarioChestPain: '2. Urgent: Crushing Chest Pain & Arm Ache',
    scenarioBreathing: '3. Urgent: Severe Wheezing & Breathlessness',
    scenarioFever: '4. Elevated: High Fever & Shivering (3 Days)',
    scenarioHeadache: '5. Elevated: Throbbing Temple Migraine',
    scenarioCough: '6. Elevated: Persistent Productive Cough',
    scenarioAbdominal: '7. Elevated: Sharp Stomach Cramps',
    scenarioGastro: '8. Urgent: Frequent Vomiting & Diarrhea',
    scenarioDizziness: '9. Elevated: Sudden Lightheadedness & Vertigo',
    scenarioInjury: '10. Elevated: Ankle Twist & Painful Swelling',
    startVoiceIntake: 'Start with Voice Assistant',
    voiceIntakeNav: 'Voice Assistant (Odia / Hindi / EN)',
    dictateComplaint: 'Speak Symptoms',
    jumpToVoice: 'Jump to Voice Interview (Step 4)',
    autoAgentMode: 'Autonomous Voice Agent',
    startAutoAgentBtn: 'Start Hands-Free Voice Agent',
    pauseAutoAgentBtn: 'Pause Agent',
    resumeAutoAgentBtn: 'Resume Agent',
    stopAutoAgentBtn: 'Stop Agent',
    autoAgentDesc: 'Continuous conversation: The agent speaks each question and listens for your answer automatically.',
    autoAdvancingIn: 'Auto-saving answer in {seconds}s... (Click to pause or edit)',

    documentUploadTitle: 'Attach Documents or Photos (Optional)',
    documentUploadSubtitle: 'You may upload prescription photos, lab reports, or injury pictures.',
    uploadFileLabel: 'Choose file to upload (PDF, PNG, JPG — Max 10MB)',
    fileSelected: 'File selected: {name}',
    noFileSelected: 'No document attached',

    reviewTitle: 'Review & Verify Intake Information',
    reviewSubtitle: 'Please verify your information before submitting.',
    reviewSummaryHeading: 'Intake Summary',
    readyToSubmit: 'All sections completed. Click below to submit your case to the clinic queue.',
    disclaimerAgreement:
      'I understand that Jan Saathi AI organizes my intake for healthcare professionals and is not a substitute for immediate in-person emergency hospital care.',

    completeTitle: 'Assessment Submitted Successfully!',
    completeSubtitle: 'Your case has been securely queued for clinical review.',
    publicCaseIdLabel: 'Your Public Case ID:',
    accessTokenLabel: 'Your Private Case Access Token:',
    tokenSaveWarning:
      'IMPORTANT: Write down or save this access token now! Because patients do not have passwords or user accounts, this secret token is the ONLY way you can check case updates or download your receipt.',
    downloadReceiptBtn: 'Download Case Receipt (PDF)',

    vitalsTitle: 'Live Sensor Telemetry & Vitals Recording',
    vitalsSubtitle: 'Wear your clip sensor or view simulated live telemetry stream.',
    sensorGuidance: 'Please place the finger pulse oximeter clip on your index finger and remain seated calmly while the system measures your vitals.',
    heartRateLabel: 'Heart Rate (Pulse)',
    bloodOxygenLabel: 'Blood Oxygen (SpO2)',
    bloodPressureLabel: 'Blood Pressure (BP)',
    temperatureLabel: 'Body Temperature',
    sensorConnected: 'Sensor Telemetry Captured & Stabilized',
    noReportsVoicePrompt: "Say 'I don't have reports' or click below to proceed directly to vitals.",
    iDontHaveReportsBtn: "I don't have any reports → Continue to Vitals",
    allStepsVoiceTitle: 'Jan Saathi Conversational Voice Doctor',
    transcribingSpeech: 'Transcribing your speech with Sarvam AI...',
    generatingQuestions: 'Jan Saathi AI is analyzing your symptoms and generating personalized clinical questions...',
    readingTelemetry: 'Acquiring live vitals telemetry from finger pulse sensor...',
    submittingToDoctor: 'Submitting health assessment case to clinic doctor queue...',
    speechNotCaptured: 'Could not clearly hear your voice. Please tap Speak again or type above.',
    doneSpeaking: 'Done Speaking',
  },

  hi: {
    appName: 'जन साथी एआई',
    appSubtitle: 'सार्वजनिक स्वास्थ्य सेवन एवं सहायता मंच',
    emergencyNotice: 'आपातकालीन चेतावनी:',
    emergencyWarning:
      'यदि आपको सीने में तेज दर्द, सांस लेने में अत्यधिक तकलीफ, अचानक कमजोरी या भारी रक्तस्राव हो रहा है, तो तुरंत 112 / 108 पर कॉल करें या नजदीकी आपातकालीन केंद्र जाएं।',
    emergencyCall: 'आपातकालीन नंबर: 112 / 108',
    checkExistingCase: 'पुराने केस की स्थिति देखें',
    selectLanguage: 'भाषा / Language / ଭାଷା',
    stepOf: 'चरण {current} / {total}',
    next: 'आगे बढ़ें',
    back: 'पीछे जाएं',
    submit: 'स्वास्थ्य मूल्यांकन जमा करें',
    submitting: 'जमा किया जा रहा है...',
    cancel: 'रद्द करें',
    save: 'सहेजें',
    confirm: 'पुष्टि करें और आगे बढ़ें',
    edit: 'उत्तर सुधारें',
    clear: 'साफ़ करें',
    close: 'बंद करें',
    optional: 'वैकल्पिक',
    required: 'आवश्यक',

    personalInfoTitle: 'व्यक्तिगत जानकारी',
    personalInfoSubtitle: 'किसी खाते या पासवर्ड की आवश्यकता नहीं है। जमा करने पर आपको एक सुरक्षित केस एक्सेस टोकन मिलेगा।',
    fullNameLabel: 'पूरा नाम / पहचान',
    fullNamePlaceholder: 'उदा. रमेश कुमार',
    ageLabel: 'आयु (वर्ष)',
    agePlaceholder: 'उदा. 45',
    genderLabel: 'लिंग',
    genderMale: 'पुरुष',
    genderFemale: 'महिला',
    genderOther: 'अन्य',
    genderPreferNot: 'बताना नहीं चाहते',
    contactLabel: 'संपर्क मोबाइल नंबर (वैकल्पिक)',
    contactPlaceholder: '10 अंकों का मोबाइल नंबर',
    contactHelp: 'इसका उपयोग केवल आपातकालीन स्पष्टीकरण के लिए स्वास्थ्य कर्मियों द्वारा किया जाएगा।',

    chiefComplaintTitle: 'स्वास्थ्य समस्या एवं लक्षण',
    chiefComplaintSubtitle: 'कृपया अपनी मुख्य बीमारी या परेशानी का वर्णन अपने शब्दों में करें।',
    complaintLabel: 'आपकी मुख्य स्वास्थ्य समस्या क्या है?',
    complaintPlaceholder: 'उदा. पिछले 2 दिनों से तेज़ सिरदर्द और बुखार है...',
    durationLabel: 'यह समस्या कितने समय से है?',
    durationPlaceholder: 'उदा. 2 दिन, 3 हफ्ते, आज सुबह से',
    severityLabel: 'अभी आपके लक्षणों की तीव्रता कैसी है?',
    severityMild: 'हल्की (महसूस होती है पर सामान्य काम नहीं रुकता)',
    severityModerate: 'मध्यम (असहजता और कुछ सामान्य कार्यों में बाधा)',
    severitySevere: 'गंभीर (अत्यधिक परेशानी या सामान्य काम करने में असमर्थ)',

    medicalHistoryTitle: 'पुरानी बीमारियां एवं एलर्जी',
    medicalHistorySubtitle: 'पुरानी स्वास्थ्य जानकारी देने से डॉक्टर आपके मामले का सुरक्षित मूल्यांकन कर सकते हैं।',
    conditionsLabel: 'पुरानी बीमारियां (वैकल्पिक)',
    conditionsPlaceholder: 'उदा. शुगर (डायबिटीज), बीपी, दमा, थायराइड (या कोई नहीं)',
    allergiesLabel: 'दवा या भोजन से एलर्जी (वैकल्पिक)',
    allergiesPlaceholder: 'उदा. पेनिसिलिन, सल्फा दवाएं, मूंगफली (या कोई नहीं)',
    medicationsLabel: 'वर्तमान में चल रही दवाएं (वैकल्पिक)',
    medicationsPlaceholder: 'उदा. मेटफॉर्मिन 500mg, एम्लोडिपिन 5mg (या कोई नहीं)',

    interviewTitle: 'नैदानिक पूछताछ (क्लिनिकल इंटरव्यू)',
    interviewSubtitle: 'हमारा स्वचालित सिस्टम आपके लक्षणों के आधार पर अनुवर्ती प्रश्न पूछता है।',
    interviewDisclaimer:
      'एआई-सहायक प्रोटोकॉल — ये अनुवर्ती प्रश्न स्वचालित नियमों द्वारा डॉक्टर की सहायता हेतु तैयार किए गए हैं। ये प्रत्यक्ष चिकित्सीय सलाह या निदान नहीं हैं।',
    yourAnswerLabel: 'आपका उत्तर:',
    yourAnswerPlaceholder: 'अपना उत्तर टाइप करें या वॉयस कंट्रोल से बोलें...',
    submitAnswer: 'उत्तर सहेजें और अगला प्रश्न',
    duplicatePrevented: 'दोहराया गया प्रश्न हटाया गया।',
    loadingQuestions: 'आपके उत्तरों का विश्लेषण और अगला प्रश्न तैयार हो रहा है...',
    noQuestionsLeft: 'सभी प्रश्नों के उत्तर पूर्ण हो गए हैं। अब आप दस्तावेज़ संलग्न कर सकते हैं।',

    voiceAssistantTitle: 'बहुभाषी वॉयस असिस्टेंट',
    voiceModeSimulated: 'मोड A: सिमुलेटेड वॉइस डेमो',
    voiceModeBrowser: 'मोड B: ब्राउज़र वॉयस',
    voiceModeText: 'मोड C: केवल टेक्स्ट',
    voicePrivacyNotice:
      'वॉयस पहचान आपके ब्राउज़र में स्थानीय रूप से चलती है। कोई भी ऑडियो किसी बाहरी क्लाउड एआई को नहीं भेजा जाता। आप जमा करने से पहले हर बोले गए उत्तर की समीक्षा कर सकते हैं।',
    voiceBrowserUnsupported:
      'इस ब्राउज़र में वेब स्पीच एपीआई उपलब्ध नहीं है। आप मोड A (सिम्युलेटेड डेमो) या मोड C (केवल टेक्स्ट) का उपयोग कर सकते हैं।',
    voiceMicPermissionDenied:
      'माइक्रोफ़ोन की अनुमति अस्वीकृत है। कृपया ब्राउज़र सेटिंग्स में माइक्रोफ़ोन की अनुमति दें या मोड A / मोड C चुनें।',
    voiceStatusIdle: 'तैयार',
    voiceStatusSpeaking: 'सहायक बोल रहा है...',
    voiceStatusListening: 'आपकी आवाज़ सुन रहा है...',
    voiceStatusReviewing: 'बोले गए उत्तर की समीक्षा करें',
    voiceStatusProcessing: 'उत्तर संसाधित हो रहा है...',
    voiceStatusPaused: 'बातचीत रोकी गई',
    voiceStatusCompleted: 'इंटरव्यू पूरा हुआ',
    speakQuestionBtn: 'प्रश्न सुनें',
    repeatQuestionBtn: 'प्रश्न दोहराएं',
    startSpeakingBtn: 'उत्तर बोलें',
    stopListeningBtn: 'सुनना बंद करें',
    pauseBtn: 'रोकें',
    resumeBtn: 'पुनः शुरू करें',
    resetSessionBtn: 'वॉयस सत्र रीसेट करें',
    confirmTranscriptBtn: 'बोला गया उत्तर स्वीकार करें',
    scenarioSelectLabel: 'परीक्षण परिदृश्य चुनें (सिमुलेशन मोड):',
    scenarioRoutine: '1. सामान्य: त्वचा पर हल्की खुजली / दाने (सामान्य)',
    scenarioChestPain: '2. आपातकालीन: सीने में भारी दर्द और बांह में खिंचाव',
    scenarioBreathing: '3. आपातकालीन: सांस फूलना और फेफड़ों में घड़घड़ाहट',
    scenarioFever: '4. उन्नत: तेज बुखार और कंपकंपी (3 दिन से)',
    scenarioHeadache: '5. उन्नत: सिर में तेज आधासीसी (माइग्रेन) दर्द',
    scenarioCough: '6. उन्नत: लगातार कफ वाली खांसी',
    scenarioAbdominal: '7. उन्नत: पेट में तेज़ मरोड़ व दर्द',
    scenarioGastro: '8. आपातकालीन: बार-बार उल्टी और पतले दस्त',
    scenarioDizziness: '9. उन्नत: अचानक चक्कर आना और आंखों के आगे अंधेरा',
    scenarioInjury: '10. उन्नत: पैर मुड़ना और टखने में भारी सूजन',
    startVoiceIntake: 'आवाज़ सहायक से शुरू करें',
    voiceIntakeNav: 'आवाज़ सहायक (ଓଡ଼ିଆ / हिन्दी / EN)',
    dictateComplaint: 'लक्षण बोलकर बताएं',
    jumpToVoice: 'सीधे आवाज़ साक्षात्कार पर जाएं (चरण 4)',
    autoAgentMode: 'स्वायत्त वॉइस एजेंट',
    startAutoAgentBtn: 'हैंड्स-फ्री वॉइस एजेंट शुरू करें',
    pauseAutoAgentBtn: 'एजेंट रोकें',
    resumeAutoAgentBtn: 'एजेंट पुनः शुरू करें',
    stopAutoAgentBtn: 'एजेंट बंद करें',
    autoAgentDesc: 'निरंतर हैंड्स-फ्री बातचीत: एजेंट स्वतः प्रश्न पूछता है और आपका उत्तर सुनता है।',
    autoAdvancingIn: '{seconds} सेकेंड में उत्तर सुरक्षित हो रहा है... (रोकने के लिए क्लिक करें)',

    documentUploadTitle: 'दस्तावेज़ या फ़ोटो संलग्न करें (वैकल्पिक)',
    documentUploadSubtitle: 'आप पुराने पर्चे, जांच रिपोर्ट या चोट की फ़ोटो अपलोड कर सकते हैं।',
    uploadFileLabel: 'अपलोड करने के लिए फ़ाइल चुनें (PDF, PNG, JPG — अधिकतम 10MB)',
    fileSelected: 'चुनी गई फ़ाइल: {name}',
    noFileSelected: 'कोई फ़ाइल संलग्न नहीं है',

    reviewTitle: 'विवरण की समीक्षा करें',
    reviewSubtitle: 'कृपया जमा करने से पहले अपनी सभी प्रविष्टियों की जांच करें।',
    reviewSummaryHeading: 'केस का संक्षिप्त विवरण',
    readyToSubmit: 'सभी चरण पूर्ण हैं। अपने केस को डॉक्टर की कतार में भेजने के लिए नीचे क्लिक करें।',
    disclaimerAgreement:
      'मैं समझता/समझती हूँ कि जन साथी एआई डॉक्टरों की मदद के लिए जानकारी संकलित करता है और यह अस्पताल की तत्काल आपातकालीन सेवा का विकल्प नहीं है।',

    completeTitle: 'स्वास्थ्य मूल्यांकन सफलतापूर्वक जमा हुआ!',
    completeSubtitle: 'आपका केस डॉक्टर की समीक्षा के लिए सुरक्षित रूप से दर्ज कर लिया गया है।',
    publicCaseIdLabel: 'आपकी सार्वजनिक केस आईडी:',
    accessTokenLabel: 'आपका निजी केस एक्सेस टोकन:',
    tokenSaveWarning:
      'महत्वपूर्ण: इस एक्सेस टोकन को अभी लिख लें या सुरक्षित कर लें! मरीजों का कोई पासवर्ड या खाता नहीं होता, इसलिए केस की स्थिति देखने या रसीद डाउनलोड करने का यही एकमात्र सुरक्षित साधन है।',
    downloadReceiptBtn: 'केस रसीद डाउनलोड करें (PDF)',

    vitalsTitle: 'लाइव सेंसर एवं वाइटल्स रिकॉर्डिंग',
    vitalsSubtitle: 'उंगली पर क्लिप लगाएं या लाइव सेंसर टेलीमेट्री देखें।',
    sensorGuidance: 'कृपया उंगली पर पल्स ऑक्सीमीटर क्लिप लगाएं और शांत बैठें। हम आपकी हृदय गति, ऑक्सीजन और रक्तचाप माप रहे हैं।',
    heartRateLabel: 'हृदय गति (पल्स)',
    bloodOxygenLabel: 'रक्त ऑक्सीजन (SpO2)',
    bloodPressureLabel: 'रक्तचाप (BP)',
    temperatureLabel: 'शरीर का तापमान',
    sensorConnected: 'सेंसर टेलीमेट्री सफलतापूर्वक दर्ज हो गई',
    noReportsVoicePrompt: "माइक में बोलें 'मेरे पास नहीं है' या वाइटल्स पर आगे बढ़ें।",
    iDontHaveReportsBtn: "मेरे पास कोई रिपोर्ट नहीं है → वाइटल्स पर आगे बढ़ें",
    allStepsVoiceTitle: 'जन साथी संवादपरक वॉइस डॉक्टर',
    transcribingSpeech: 'आपकी आवाज़ का अनुवाद किया जा रहा है (Sarvam AI)...',
    generatingQuestions: 'जन साथी AI आपके लक्षणों का विश्लेषण कर सवाल तैयार कर रहा है...',
    readingTelemetry: 'पल्स ऑक्सीमीटर सेंसर से लाइव वाइटल्स टेलीमेट्री रिकॉर्ड हो रही है...',
    submittingToDoctor: 'डॉक्टर की समीक्षा कतार में केस जमा किया जा रहा है...',
    speechNotCaptured: 'आपकी आवाज़ स्पष्ट सुनाई नहीं दी। कृपया पुनः बोलें या टाइप करें।',
    doneSpeaking: 'बोल चुका',
  },

  or: {
    appName: 'ଜନ ସାଥୀ ଏଆଇ',
    appSubtitle: 'ସାର୍ବଜନୀନ ସ୍ୱାସ୍ଥ୍ୟ ସେବନ ଓ ସହାୟତା ମଞ୍ଚ',
    emergencyNotice: 'ଜରୁରୀକାଳୀନ ସତର୍କତା:',
    emergencyWarning:
      'ଯଦି ଆପଣ ଛାତିରେ ପ୍ରବଳ ଯନ୍ତ୍ରଣା, ଶ୍ୱାସକଷ୍ଟ, ହଠାତ୍ ଅଚେତ ହେବା କିମ୍ବା ଅତ୍ୟଧିକ ରକ୍ତସ୍ରାବ ଅନୁଭବ କରୁଛନ୍ତି, ତେବେ ତୁରନ୍ତ 112 / 108 ରେ ଫୋନ୍ କରନ୍ତୁ କିମ୍ବା ନିକଟସ୍ଥ ଡାକ୍ତରଖାନା ଯାଆନ୍ତୁ।',
    emergencyCall: 'ଜରୁରୀକାଳୀନ ହେଲ୍ପଲାଇନ୍: 112 / 108',
    checkExistingCase: 'ପୂର୍ବ କେସ୍ ସ୍ଥିତି ଯାଞ୍ଚ କରନ୍ତୁ',
    selectLanguage: 'ଭାଷା / Language / भाषा',
    stepOf: 'ପର୍ଯ୍ୟାୟ {current} / {total}',
    next: 'ଆଗକୁ ବଢ଼ନ୍ତୁ',
    back: 'ପଛକୁ ଯାଆନ୍ତୁ',
    submit: 'ସ୍ୱାସ୍ଥ୍ୟ ମୂଲ୍ୟାଙ୍କନ ଦାଖଲ କରନ୍ତୁ',
    submitting: 'ଦାଖଲ ହେଉଛି...',
    cancel: 'ବାତିଲ କରନ୍ତୁ',
    save: 'ସାଇତନ୍ତୁ',
    confirm: 'ନିଶ୍ଚିତ କରନ୍ତୁ ଓ ଆଗକୁ ଯାଆନ୍ତୁ',
    edit: 'ଉତ୍ତର ସଂଶୋଧନ କରନ୍ତୁ',
    clear: 'ସଫା କରନ୍ତୁ',
    close: 'ବନ୍ଦ କରନ୍ତୁ',
    optional: 'ଇଚ୍ଛାଧୀନ',
    required: 'ଆବଶ୍ୟକ',

    personalInfoTitle: 'ବ୍ୟକ୍ତିଗତ ବିବରଣୀ',
    personalInfoSubtitle: 'କୌଣସି ଆକାଉଣ୍ଟ କିମ୍ବା ପାସୱାର୍ଡ଼ ଆବଶ୍ୟକ ନାହିଁ। ଦାଖଲ କରିବା ପରେ ଏକ ସୁରକ୍ଷିତ କେସ୍ ଟୋକନ୍ ମିଳିବ।',
    fullNameLabel: 'ପୂରା ନାମ / ପରିଚୟ',
    fullNamePlaceholder: 'ଯେପରି: ରମେଶ ପ୍ରଧାନ',
    ageLabel: 'ବୟସ (ବର୍ଷ)',
    agePlaceholder: 'ଯେପରି: 45',
    genderLabel: 'ଲିଙ୍ଗ',
    genderMale: 'ପୁରୁଷ',
    genderFemale: 'ମହିଳା',
    genderOther: 'ଅନ୍ୟାନ୍ୟ',
    genderPreferNot: 'କହିବାକୁ ଚାହୁଁନାହାନ୍ତି',
    contactLabel: 'ଯୋଗାଯୋଗ ମୋବାଇଲ୍ ନମ୍ବର (ଇଚ୍ଛାଧୀନ)',
    contactPlaceholder: '୧୦ ଅଙ୍କ ବିଶିଷ୍ଟ ମୋବାଇଲ୍ ନମ୍ବର',
    contactHelp: 'କେବଳ ଜରୁରୀ ପରିସ୍ଥିତିରେ ଡାକ୍ତରୀ ସ୍ପଷ୍ଟୀକରଣ ପାଇଁ ବ୍ୟବହୃତ ହେବ।',

    chiefComplaintTitle: 'ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା ଓ ଲକ୍ଷଣ',
    chiefComplaintSubtitle: 'ଦୟାକରି ଆପଣଙ୍କର ମୁଖ୍ୟ ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା ନିଜ ଭାଷାରେ ବର୍ଣ୍ଣନା କରନ୍ତୁ।',
    complaintLabel: 'ଆପଣଙ୍କର ପ୍ରମୁଖ ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା କ’ଣ?',
    complaintPlaceholder: 'ଯେପରି: ଗତ ୨ ଦିନ ହେଲା ପ୍ରବଳ ମୁଣ୍ଡବିନ୍ଧା ଓ ଜ୍ୱର ହେଉଛି...',
    durationLabel: 'ଏହି ସମସ୍ୟା କେତେ ଦିନ ହେଲା ଲାଗି ରହିଛି?',
    durationPlaceholder: 'ଯେପରି: ୨ ଦିନ, ୩ ସପ୍ତାହ, ଆଜି ସକାଳୁ',
    severityLabel: 'ବର୍ତ୍ତମାନ ଆପଣଙ୍କ ଲକ୍ଷଣର ତୀବ୍ରତା କିପରି ଅଛି?',
    severityMild: 'ସାମାନ୍ୟ (ଅନୁଭବ ହୁଏ କିନ୍ତୁ ଦୈନନ୍ଦିନ କାର୍ଯ୍ୟ ବନ୍ଦ ହୁଏ ନାହିଁ)',
    severityModerate: 'ମଧ୍ୟମ (ଅସହଜତା ଏବଂ କିଛି ସାଧାରଣ କାମରେ ବାଧା)',
    severitySevere: 'ଗମ୍ଭୀର (ଅତ୍ୟଧିକ କଷ୍ଟ କିମ୍ବା ସାଧାରଣ କାର୍ଯ୍ୟ କରିବାରେ ଅକ୍ଷମ)',

    medicalHistoryTitle: 'ପୂର୍ବ ରୋଗ ଇତିହାସ ଓ ଆଲର୍ଜି',
    medicalHistorySubtitle: 'ପୂର୍ବ ସ୍ୱାସ୍ଥ୍ୟ ବିବରଣୀ ଦେବା ଦ୍ୱାରା ଡାକ୍ତର ଆପଣଙ୍କ ରୋଗକୁ ସଠିକ୍ ଭାବେ ବୁଝିପାରିବେ।',
    conditionsLabel: 'ପୂର୍ବରୁ ଥିବା ରୋଗ (ଇଚ୍ଛାଧୀନ)',
    conditionsPlaceholder: 'ଯେପରି: ମଧୁମେହ (Diabetes), ଉଚ୍ଚ ରକ୍ତଚାପ (BP), ଶ୍ୱାସ, ଥାଇରଏଡ୍ (ବା କିଛି ନାହିଁ)',
    allergiesLabel: 'ଔଷଧ କିମ୍ବା ଖାଦ୍ୟ ଆଲର୍ଜି (ଇଚ୍ଛାଧୀନ)',
    allergiesPlaceholder: 'ଯେପରି: ପେନିସିଲିନ୍, ସଲଫା, ଚିନାବାଦାମ (ବା କିଛି ନାହିଁ)',
    medicationsLabel: 'ବର୍ତ୍ତମାନ ଚାଲୁଥିବା ଔଷଧ (ଇଚ୍ଛାଧୀନ)',
    medicationsPlaceholder: 'ଯେପରି: Metformin 500mg, Amlodipine 5mg (ବା କିଛି ନାହିଁ)',

    interviewTitle: 'ଡାକ୍ତରୀ ପଚରାଉଚରା (କ୍ଲିନିକାଲ୍ ଇଣ୍ଟରଭ୍ୟୁ)',
    interviewSubtitle: 'ଆମର ସ୍ୱୟଂଚାଳିତ ପ୍ରଣାଳୀ ଆପଣଙ୍କ ଲକ୍ଷଣ ଅନୁସାରେ ପରବର୍ତ୍ତୀ ପ୍ରଶ୍ନ ପଚାରିଥାଏ।',
    interviewDisclaimer:
      'ଏଆଇ-ସହାୟକ ପ୍ରୋଟୋକଲ୍ — ଏହି ପ୍ରଶ୍ନଗୁଡ଼ିକ ଡାକ୍ତରଙ୍କ ସମୀକ୍ଷା ପାଇଁ ସ୍ୱୟଂଚାଳିତ ନିୟମ ଦ୍ୱାରା ପ୍ରସ୍ତୁତ କରାଯାଇଛି। ଏହା ପ୍ରତ୍ୟକ୍ଷ ଡାକ୍ତରୀ ପରାମର୍ଶ କିମ୍ବା ରୋଗ ନିର୍ଣ୍ଣୟ ନୁହେଁ।',
    yourAnswerLabel: 'ଆପଣଙ୍କ ଉତ୍ତର:',
    yourAnswerPlaceholder: 'ଉତ୍ତର ଲେଖନ୍ତୁ କିମ୍ବା ଭଏସ୍ କଣ୍ଟ୍ରୋଲ୍ ବ୍ୟବହାର କରି କୁହନ୍ତୁ...',
    submitAnswer: 'ଉତ୍ତର ସାଇତନ୍ତୁ ଓ ପରବର୍ତ୍ତୀ ପ୍ରଶ୍ନ',
    duplicatePrevented: 'ପୁନରାବୃତ୍ତି ପ୍ରଶ୍ନକୁ ବାଦ୍ ଦିଆଗଲା।',
    loadingQuestions: 'ଆପଣଙ୍କ ଉତ୍ତରର ବିଶ୍ଳେଷଣ ଓ ପରବର୍ତ୍ତୀ ପ୍ରଶ୍ନ ପ୍ରସ୍ତୁତ ହେଉଛି...',
    noQuestionsLeft: 'ସମସ୍ତ ପ୍ରଶ୍ନୋତ୍ତର ସମାପ୍ତ ହୋଇଛି। ଆପଣ ଡକ୍ୟୁମେଣ୍ଟ ଯୋଡ଼ିବାକୁ ଆଗକୁ ବଢ଼ିପାରିବେ।',

    voiceAssistantTitle: 'ବହୁଭାଷୀ ଭଏସ୍ ଆସିଷ୍ଟାଣ୍ଟ',
    voiceModeSimulated: 'ମୋଡ୍ A: ସିମୁଲେଟେଡ୍ ଭଏସ୍ ଡେମୋ',
    voiceModeBrowser: 'ମୋଡ୍ B: ବ୍ରାଉଜର୍ ଭଏସ୍',
    voiceModeText: 'ମୋଡ୍ C: କେବଳ ଟେକ୍ସଟ୍',
    voicePrivacyNotice:
      'ଭଏସ୍ ଚିହ୍ନଟ ଆପଣଙ୍କ ବ୍ରାଉଜରରେ ସ୍ଥାନୀୟ ଭାବରେ କାର୍ଯ୍ୟ କରେ। କୌଣସି ଅଡିଓ ବାହ୍ୟ କ୍ଲାଉଡ୍ ଏଆଇକୁ ପଠାଯାଏ ନାହିଁ। ଆପଣ ଦାଖଲ କରିବା ପୂର୍ବରୁ ପ୍ରତ୍ୟେକ ଉତ୍ତରକୁ ସଂଶୋଧନ କରିପାରିବେ।',
    voiceBrowserUnsupported:
      'ଏହି ବ୍ରାଉଜରରେ ୱେବ୍ ସ୍ପିଚ୍ ଏପିଆଇ ଉପଲବ୍ଧ ନାହିଁ। ଆପଣ ମୋଡ୍ A (ସିମୁଲେଟେଡ୍ ଡେମୋ) କିମ୍ବା ମୋଡ୍ C (କେବଳ ଟେକ୍ସଟ୍) ବ୍ୟବହାର କରିପାରିବେ।',
    voiceMicPermissionDenied:
      'ମାଇକ୍ରୋଫୋନ୍ ଅନୁମତି ମିଳିନାହିଁ। ଦୟାକରି ବ୍ରାଉଜର୍ ସେଟିଙ୍ଗରେ ମାଇକ୍ରୋଫୋନ୍ ଅନୁମତି ଦିଅନ୍ତୁ କିମ୍ବା ମୋଡ୍ A / C ଚୟନ କରନ୍ତୁ।',
    voiceStatusIdle: 'ପ୍ରସ୍ତୁତ',
    voiceStatusSpeaking: 'ସହାୟକ କହୁଛନ୍ତି...',
    voiceStatusListening: 'ଆପଣଙ୍କ କଥା ଶୁଣୁଛନ୍ତି...',
    voiceStatusReviewing: 'କୁହାଯାଇଥିବା ଉତ୍ତର ଯାଞ୍ଚ କରନ୍ତୁ',
    voiceStatusProcessing: 'ଉତ୍ତର ପ୍ରକ୍ରିୟାକରଣ ଚାଲିଛି...',
    voiceStatusPaused: 'କଥାବାର୍ତ୍ତା ସ୍ଥଗିତ ରହିଛି',
    voiceStatusCompleted: 'ଇଣ୍ଟରଭ୍ୟୁ ସମ୍ପୂର୍ଣ୍ଣ ହୋଇଛି',
    speakQuestionBtn: 'ପ୍ରଶ୍ନ ଶୁଣନ୍ତୁ',
    repeatQuestionBtn: 'ପ୍ରଶ୍ନ ଦୋହରାନ୍ତୁ',
    startSpeakingBtn: 'ଉତ୍ତର କୁହନ୍ତୁ',
    stopListeningBtn: 'ଶୁଣିବା ବନ୍ଦ କରନ୍ତୁ',
    pauseBtn: 'ସ୍ଥଗିତ କରନ୍ତୁ',
    resumeBtn: 'ପୁନଃ ଚାଲୁ କରନ୍ତୁ',
    resetSessionBtn: 'ଭଏସ୍ ସେସନ୍ ରିସେଟ୍ କରନ୍ତୁ',
    confirmTranscriptBtn: 'କୁହାଯାଇଥିବା ଉତ୍ତର ଗ୍ରହଣ କରନ୍ତୁ',
    scenarioSelectLabel: 'ପରୀକ୍ଷା ପରିସ୍ଥିତି ଚୟନ କରନ୍ତୁ (ସିମୁଲେସନ୍ ମୋଡ୍):',
    scenarioRoutine: '1. ସାଧାରଣ: ଚର୍ମରେ ସାମାନ୍ୟ କୁଣ୍ଡାଇ ହେବା / ଫଳିବା (ସାଧାରଣ)',
    scenarioChestPain: '2. ଜରୁରୀ: ଛାତିରେ ଭୀଷଣ ଯନ୍ତ୍ରଣା ଓ ବାମ ବାହୁରେ ଟାଣିବା',
    scenarioBreathing: '3. ଜରୁରୀ: ପ୍ରବଳ ଶ୍ୱାସକଷ୍ଟ ଓ ଛାତିରୁ ଘଁ ଘଁ ଶବ୍ଦ',
    scenarioFever: '4. ଉନ୍ନତ: ପ୍ରବଳ ଜ୍ୱର ଓ କମ୍ପନ (୩ ଦିନ ଧରି)',
    scenarioHeadache: '5. ଉନ୍ନତ: ମୁଣ୍ଡରେ ତୀବ୍ର ଅଧକପାଳୀ (ମାଇଗ୍ରେନ) ଯନ୍ତ୍ରଣା',
    scenarioCough: '6. ଉନ୍ନତ: କ୍ରମାଗତ କଫଯୁକ୍ତ କାଶ',
    scenarioAbdominal: '7. ଉନ୍ନତ: ପେଟରେ ପ୍ରବଳ ମୋଡ଼ି ହୋଇ ଯନ୍ତ୍ରଣା',
    scenarioGastro: '8. ଜରୁରୀ: ବାରମ୍ବାର ବାନ୍ତି ଓ ପତଳା ଝାଡ଼ା',
    scenarioDizziness: '9. ଉନ୍ନତ: ହଠାତ୍ ମୁଣ୍ଡ ବୁଲାଇବା ଓ ଆଖି ଆଗରେ ଅନ୍ଧାର',
    scenarioInjury: '10. ଉନ୍ନତ: ଗୋଡ଼ ମୋଡ଼ି ହୋଇ ଗଣ୍ଠି ଫୁଲିଯିବା',
    startVoiceIntake: 'ସ୍ୱର ସହାୟକରୁ ଆରମ୍ଭ କରନ୍ତୁ',
    voiceIntakeNav: 'ସ୍ୱର ସହାୟକ (ଓଡ଼ିଆ / हिन्दी / EN)',
    dictateComplaint: 'ସ୍ୱରରେ ଲକ୍ଷଣ କୁହନ୍ତୁ',
    jumpToVoice: 'ସିଧା ସ୍ୱର ସାକ୍ଷାତକାରକୁ ଯାଆନ୍ତୁ (ପର୍ଯ୍ୟାୟ ୪)',
    autoAgentMode: 'ସ୍ୱୟଂଚାଳିତ ଭଏସ୍ ଏଜେଣ୍ଟ',
    startAutoAgentBtn: 'ହ୍ୟାଣ୍ଡସ୍-ଫ୍ରି ଭଏସ୍ ଏଜେଣ୍ଟ ଆରମ୍ଭ କରନ୍ତୁ',
    pauseAutoAgentBtn: 'ଏଜେଣ୍ଟ ରୋକନ୍ତୁ',
    resumeAutoAgentBtn: 'ଏଜେଣ୍ଟ ପୁନଃ ଚାଲୁ କରନ୍ତୁ',
    stopAutoAgentBtn: 'ଏଜେଣ୍ଟ ବନ୍ଦ କରନ୍ତୁ',
    autoAgentDesc: 'କ୍ରମାଗତ କଥାବାର୍ତ୍ତା: ଏଜେଣ୍ଟ ସ୍ୱତଃ ପ୍ରଶ୍ନ ପଚାରନ୍ତି ଏବଂ ଆପଣଙ୍କ ଉତ୍ତର ଶୁଣନ୍ତି।',
    autoAdvancingIn: '{seconds} ସେକେଣ୍ଡରେ ଉତ୍ତର ସାଇତା ହେଉଛି... (ସ୍ଥଗିତ ପାଇଁ କ୍ଲିକ୍ କରନ୍ତୁ)',

    documentUploadTitle: 'ଡକ୍ୟୁମେଣ୍ଟ ବା ଫଟୋ ସଂଲଗ୍ନ କରନ୍ତୁ (ଇଚ୍ଛାଧୀନ)',
    documentUploadSubtitle: 'ଆପଣ ପୁରୁଣା ପ୍ରେସକ୍ରିପସନ୍, ପରୀକ୍ଷା ରିପୋର୍ଟ କିମ୍ବା କ୍ଷତର ଫଟୋ ଅପଲୋଡ୍ କରିପାରିବେ।',
    uploadFileLabel: 'ଅପଲୋଡ୍ ପାଇଁ ଫାଇଲ୍ ବାଛନ୍ତୁ (PDF, PNG, JPG — ସର୍ବାଧିକ 10MB)',
    fileSelected: 'ଚୟନିତ ଫାଇଲ୍: {name}',
    noFileSelected: 'କୌଣସି ଫାଇଲ୍ ଯୋଡ଼ା ଯାଇନାହିଁ',

    reviewTitle: 'ବିବରଣୀ ଯାଞ୍ଚ କରନ୍ତୁ',
    reviewSubtitle: 'ଦାଖଲ କରିବା ପୂର୍ବରୁ ଦୟାକରି ସମସ୍ତ ତଥ୍ୟ ଯାଞ୍ଚ କରନ୍ତୁ।',
    reviewSummaryHeading: 'କେସ୍ ସାରାଂଶ',
    readyToSubmit: 'ସମସ୍ତ ପର୍ଯ୍ୟାୟ ସମ୍ପୂର୍ଣ୍ଣ। ଆପଣଙ୍କ କେସକୁ ଡାକ୍ତରଙ୍କ ଧାଡ଼ିକୁ ପଠାଇବା ପାଇଁ ତଳେ କ୍ଲିକ୍ କରନ୍ତୁ।',
    disclaimerAgreement:
      'ମୁଁ ବୁଝୁଛି ଯେ ଜନ ସାଥୀ ଏଆଇ ଡାକ୍ତରଙ୍କ ସହାୟତା ପାଇଁ ତଥ୍ୟ ସଂଗ୍ରହ କରେ ଏବଂ ଏହା ଡାକ୍ତରଖାନାର ଜରୁରୀକାଳୀନ ଚିକିତ୍ସାର ବିକଳ୍ପ ନୁହେଁ।',

    completeTitle: 'ସ୍ୱାସ୍ଥ୍ୟ ମୂଲ୍ୟାଙ୍କନ ସଫଳତାର ସହ ଦାଖଲ ହେଲା!',
    completeSubtitle: 'ଆପଣଙ୍କ କେସ୍ ଡାକ୍ତରଙ୍କ ସମୀକ୍ଷା ପାଇଁ ସୁରକ୍ଷିତ ଭାବେ ତାଲିକାଭୁକ୍ତ ହୋଇଛି।',
    publicCaseIdLabel: 'ଆପଣଙ୍କ ସାର୍ବଜନୀନ କେସ୍ ଆଇଡି (Public Case ID):',
    accessTokenLabel: 'ଆପଣଙ୍କ ବ୍ୟକ୍ତିଗତ କେସ୍ ଆକ୍ସେସ୍ ଟୋକନ୍ (Access Token):',
    tokenSaveWarning:
      'ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ: ଏହି ଆକ୍ସେସ୍ ଟୋକନ୍‌କୁ ଏବେ ଲେଖି ରଖନ୍ତୁ କିମ୍ବା ସାଇତି ରଖନ୍ତୁ! ରୋଗୀଙ୍କର କୌଣସି ପାସୱାର୍ଡ଼ ବା ଆକାଉଣ୍ଟ ନ ଥିବାରୁ, କେସ୍ ସ୍ଥିତି ଯାଞ୍ଚ କରିବା କିମ୍ବା ରସିଦ୍ ଡାଉନଲୋଡ୍ କରିବା ପାଇଁ ଏହା ଏକମାତ୍ର ମାଧ୍ୟମ।',
    downloadReceiptBtn: 'କେସ୍ ରସିଦ୍ ଡାଉନଲୋଡ୍ କରନ୍ତୁ (PDF)',

    vitalsTitle: 'ଲାଇଭ୍ ସେନ୍ସର୍ ଓ ଭାଇଟାଲ୍ସ ମାପ',
    vitalsSubtitle: 'ଆଙ୍ଗୁଠିରେ କ୍ଲିପ୍ ଲଗାନ୍ତୁ କିମ୍ବା ଲାଇଭ୍ ସେନ୍ସର୍ ଟେଲିମେଟ୍ରି ଦେଖନ୍ତୁ।',
    sensorGuidance: 'ଦୟାକରି ଆଙ୍ଗୁଠିରେ ପଲ୍ସ ଅକ୍ସିମିଟର କ୍ଲିପ୍ ଲଗାନ୍ତୁ ଏବଂ ଶାନ୍ତ ହୋଇ ବସନ୍ତୁ। ଆମେ ଆପଣଙ୍କ ହୃଦୟସ୍ପନ୍ଦନ, ଅକ୍ସିଜେନ୍ ଓ ରକ୍ତଚାପ ମାପୁଛୁ।',
    heartRateLabel: 'ହୃଦୟସ୍ପନ୍ଦନ (Heart Rate)',
    bloodOxygenLabel: 'ଅକ୍ସିଜେନ୍ (SpO2)',
    bloodPressureLabel: 'ରକ୍ତଚାପ (BP)',
    temperatureLabel: 'ଶରୀର ତାପମାତ୍ରା',
    sensorConnected: 'ସେନ୍ସର୍ ଟେଲିମେଟ୍ରି ସଫଳତାର ସହିତ ସଂଗୃହିତ ହେଲା',
    noReportsVoicePrompt: "'ମୋ ପାଖରେ ନାହିଁ' କୁହନ୍ତୁ କିମ୍ବା ଭାଇଟାଲ୍ସକୁ ଯିବା ପାଇଁ କ୍ଲିକ୍ କରନ୍ତୁ।",
    iDontHaveReportsBtn: 'ମୋ ପାଖରେ କୌଣସି ରିପୋର୍ଟ ନାହିଁ → ଭାଇଟାଲ୍ସକୁ ଯାଆନ୍ତୁ',
    allStepsVoiceTitle: 'ଜନ ସାଥୀ କଥାବାର୍ତ୍ତା ଭଏସ୍ ଡାକ୍ତର',
    transcribingSpeech: 'ଆପଣଙ୍କ ସ୍ୱର ଟ୍ରାନ୍ସକ୍ରିପସନ୍ କରାଯାଉଛି (Sarvam AI)...',
    generatingQuestions: 'ଜନସାଥୀ AI ଆପଣଙ୍କ ଲକ୍ଷଣ ବିଶ୍ଳେଷଣ କରି ପ୍ରଶ୍ନ ପ୍ରସ୍ତୁତ କରୁଛି...',
    readingTelemetry: 'ସେନ୍ସରରୁ ଲାଇଭ୍ ଶରୀର ମାପ ଡାଟା ରେକର୍ଡ ହେଉଛି...',
    submittingToDoctor: 'ଡାକ୍ତରଙ୍କ ସମୀକ୍ଷା ଧାଡ଼ିକୁ କେସ୍ ପଠାଯାଉଛି...',
    speechNotCaptured: 'ଆପଣଙ୍କ କଥା ସ୍ପଷ୍ଟ ଭାବେ ଶୁଣାଗଲା ନାହିଁ। ଦୟାକରି ପୁଣି କୁହନ୍ତୁ କିମ୍ବା ଟାଇପ୍ କରନ୍ତୁ।',
    doneSpeaking: 'ଶେଷ କଲି',
  },
};

