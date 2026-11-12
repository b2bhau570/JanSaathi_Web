import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/useLanguage';
import { synthesizeSpeech, transcribeSpeech, analyzeVoiceIntake } from '../../api/patientApi';
import type { SupportedLanguage } from '../../i18n/translations';
import { Esp32HardwareMonitor, type Esp32HardwareMonitorRef } from '../../components/hardware/Esp32HardwareMonitor';
import { esp32SerialService } from '../../services/esp32SerialService';
import {
  stopGlobalAudio,
  registerActiveAudio,
  registerActiveSpeechRecognition,
  getAudioSessionId,
  isSessionActive,
} from '../../services/globalAudio';

// Warm human nurse persona ("Ananya — Care Coordinator" at Guinex Clinic) across Indian Languages
const ALL_ANNOUNCEMENTS: Record<string, { text: string; speakText: string }> = {
  or: {
    text: 'ନମସ୍କାର, ଗୁଇନେକ୍ସ କ୍ଲିନିକ୍‌କୁ ସ୍ୱାଗତ। ମୁଁ ଅନନ୍ୟା, ଆପଣଙ୍କ ଚେକ୍-ଇନ୍ ସହଜରେ କରିବାରେ ସାହାଯ୍ୟ କରିବି। ଆପଣ ପ୍ରସ୍ତୁତ ହେଲେ କେବଳ ଆପଣଙ୍କ ଶୁଭ ନାମ କୁହନ୍ତୁ—କିମ୍ବା ନିଜେ ଫର୍ମ ପୂରଣ କରିବାକୁ ଚାହିଁଲେ "ଟାଇପିଂ" କୁହନ୍ତୁ।',
    speakText: 'ନମସ୍କାର, ଗୁଇନେକ୍ସ କ୍ଲିନିକ୍‌କୁ ସ୍ୱାଗତ। ମୁଁ ଅନନ୍ୟା, ଆପଣଙ୍କ ଚେକ୍-ଇନ୍ ସହଜରେ କରିବାରେ ସାହାଯ୍ୟ କରିବି। ଆପଣ ପ୍ରସ୍ତୁତ ହେଲେ କେବଳ ଆପଣଙ୍କ ଶୁଭ ନାମ କୁହନ୍ତୁ, କିମ୍ବା ନିଜେ ଫର୍ମ ପୂରଣ କରିବାକୁ ଚାହିଁଲେ ଟାଇପିଂ କୁହନ୍ତୁ।',
  },
  hi: {
    text: 'नमस्ते, गुइनेक्स क्लिनिक में आपका स्वागत है। मैं अनन्या हूँ, और मैं आपका चेक-इन आसानी से पूरा करने में मदद करूँगी। जब आप तैयार हों, बस अपना शुभ नाम बताइए—या अगर आप खुद फॉर्म भरना चाहते हैं तो "टाइपिंग" कहें।',
    speakText: 'नमस्ते, गुइनेक्स क्लिनिक में आपका स्वागत है। मैं अनन्या हूँ, और मैं आपका चेक-इन आसानी से पूरा करने में मदद करूँगी। जब आप तैयार हों, बस अपना शुभ नाम बताइए, या अगर आप खुद फॉर्म भरना चाहते हैं तो टाइपिंग कहें।',
  },
  bn: {
    text: 'নমস্কার, গুইনেক্স ক্লিনিকে স্বাগত। আমি অনন্যা, আপনার চেক-ইন সহজে করতে সাহায্য করব। আপনি প্রস্তুত হলে শুধু আপনার শুভ নাম বলুন—অথবা নিজে ফর্ম পূরণ করতে চাইলে "টাইপিং" বলুন।',
    speakText: 'নমস্কার, গুইনেক্স ক্লিনিকে স্বাগত। আমি অনন্যা, আপনার চেক-ইন সহজে করতে সাহায্য করব। আপনি প্রস্তুত হলে শুধু আপনার শুভ নাম বলুন, অথবা নিজে ফর্ম পূরণ করতে চাইলে টাইপিং বলুন।',
  },
  te: {
    text: 'నమస్కారం, గుయినెక్స్ క్లినిక్‌కు స్వాగతం. నేను అనన్య, మీ చెక్-ఇన్ సులభంగా పూర్తి చేయడంలో సహాయం చేస్తాను. మీరు సిద్ధంగా ఉన్నప్పుడు మీ పేరు చెప్పండి—లేదా మీరే ఫారమ్ నింపాలంటే "టైపింగ్" అని చెప్పండి.',
    speakText: 'నమస్కారం, గుయినెక్స్ క్లినిక్‌కు స్వాగతం. నేను అనన్య, మీ చెక్-ఇన్ సులభంగా పూర్తి చేయడంలో సహాయం చేస్తాను. మీరు సిద్ధంగా ఉన్నప్పుడు మీ పేరు చెప్పండి, లేదా మీరే ఫారమ్ నింపాలంటే టైపింగ్ అని చెప్పండి.',
  },
  ta: {
    text: 'வணக்கம், குயினெக்ஸ் கிளினிக்கிற்கு வரவேற்கிறோம். நான் அனன்யா, உங்கள் பதிவு எளிதாக முடிய உதவுவேன். நீங்கள் தயாரானதும் உங்கள் பெயரைச் சொல்லுங்கள்—அல்லது நீங்களே படிவத்தை நிரப்ப விரும்பினால் "டைப்பிங்" என்று சொல்லுங்கள்.',
    speakText: 'வணக்கம், குயினெக்ஸ் கிளினிக்கிற்கு வரவேற்கிறோம். நான் அனன்யா, உங்கள் பதிவு எளிதாக முடிய உதவுவேன். நீங்கள் தயாரானதும் உங்கள் பெயரைச் சொல்லுங்கள், அல்லது நீங்களே படிவத்தை நிரப்ப விரும்பினால் டைப்பிங் என்று சொல்லுங்கள்.',
  },
  mr: {
    text: 'नमस्कार, गुइनेक्स क्लिनिकमध्ये आपले स्वागत आहे. मी अनन्या आहे आणि तुमचे चेक-इन सहज पूर्ण करण्यात मदत करीन. तुम्ही तयार असाल तेव्हा फक्त तुमचे नाव सांगा—किंवा स्वतः फॉर्म भरायचा असेल तर "टायपिंग" म्हणा.',
    speakText: 'नमस्कार, गुइनेक्स क्लिनिकमध्ये आपले स्वागत आहे. मी अनन्या आहे आणि तुमचे चेक-इन सहज पूर्ण करण्यात मदत करीन. तुम्ही तयार असाल तेव्हा फक्त तुमचे नाव सांगा, किंवा स्वतः फॉर्म भरायचा असेल तर टायपिंग म्हणा.',
  },
  gu: {
    text: 'નમસ્તે, ગુઇનેક્સ ક્લિનિકમાં આપનું સ્વાગત છે. હું અનન્યા છું અને તમારું ચેક-ઇન સરળતાથી પૂરું કરવામાં મદદ કરીશ. તમે તૈયાર હો ત્યારે બસ તમારું નામ કહો—અથવા જાતે ફોર્મ ભરવું હોય તો "ટાઇપિંગ" કહો.',
    speakText: 'નમસ્તે, ગુઇનેક્સ ક્લિનિકમાં આપનું સ્વાગત છે. હું અનન્યા છું અને તમારું ચેક-ઇન સરળતાથી પૂરું કરવામાં મદદ કરીશ. તમે તૈયાર હો ત્યારે બસ તમારું નામ કહો, અથવા જાતે ફોર્મ ભરવું હોય તો ટાઇપિંગ કહો.',
  },
  kn: {
    text: 'ನಮಸ್ಕಾರ, ಗುಯಿನೆಕ್ಸ್ ಕ್ಲಿನಿಕ್‌ಗೆ ಸ್ವಾಗತ. ನಾನು ಅನನ್ಯ, ನಿಮ್ಮ ಚೆಕ್-ಇನ್ ಸುಲಭವಾಗಿ ಮುಗಿಸಲು ಸಹಾಯ ಮಾಡುತ್ತೇನೆ. ನೀವು ಸಿದ್ಧರಾದಾಗ ನಿಮ್ಮ ಹೆಸರನ್ನು ಹೇಳಿ—ಅಥವಾ ನೀವೇ ಫಾರ್ಮ್ ತುಂಬಲು ಬಯಸಿದರೆ "ಟೈಪಿಂಗ್" ಎಂದು ಹೇಳಿ.',
    speakText: 'ನಮಸ್ಕಾರ, ಗುಯಿನೆಕ್ಸ್ ಕ್ಲಿನಿಕ್‌ಗೆ ಸ್ವಾಗತ. ನಾನು ಅನನ್ಯ, ನಿಮ್ಮ ಚೆಕ್-ಇನ್ ಸುಲಭವಾಗಿ ಮುಗಿಸಲು ಸಹಾಯ ಮಾಡುತ್ತೇನೆ. ನೀವು ಸಿದ್ಧರಾದಾಗ ನಿಮ್ಮ ಹೆಸರನ್ನು ಹೇಳಿ, ಅಥವಾ ನೀವೇ ಫಾರ್ಮ್ ತುಂಬಲು ಬಯಸಿದರೆ ಟೈಪಿಂಗ್ ಎಂದು ಹೇಳಿ.',
  },
  ml: {
    text: 'നമസ്കാരം, ഗുയിനെക്സ് ക്ലിനിക്കിലേക്ക് സ്വാഗതം. ഞാൻ അനന്യ, നിങ്ങളുടെ ചെക്ക്-ഇൻ എളുപ്പത്തിൽ പൂർത്തിയാക്കാൻ സഹായിക്കാം. തയ്യാറാകുമ്പോൾ നിങ്ങളുടെ പേര് പറയൂ—അല്ലെങ്കിൽ സ്വയം ഫോം പൂരിപ്പിക്കാൻ ആഗ്രഹിക്കുന്നുവെങ്കിൽ "ടൈപ്പിംഗ്" എന്ന് പറയൂ.',
    speakText: 'നമസ്കാരം, ഗുയിനെക്സ് ക്ലിനിക്കിലേക്ക് സ്വാഗതം. ഞാൻ അനന്യ, നിങ്ങളുടെ ചെക്ക്-ഇൻ എളുപ്പത്തിൽ പൂർത്തിയാക്കാൻ സഹായിക്കാം. തയ്യാറാകുമ്പോൾ നിങ്ങളുടെ പേര് പറയൂ, അല്ലെങ്കിൽ സ്വയം ഫോം പൂരിപ്പിക്കാൻ ആഗ്രഹിക്കുന്നുവെങ്കിൽ ടൈപ്പിംഗ് എന്ന് പറയൂ.',
  },
  pa: {
    text: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, ਗੁਇਨੇਕਸ ਕਲਿਨਿਕ ਵਿੱਚ ਤੁਹਾਡਾ ਸਵਾਗਤ ਹੈ। ਮੈਂ ਅਨੰਨਿਆ ਹਾਂ, ਅਤੇ ਤੁਹਾਡਾ ਚੈੱਕ-ਇਨ ਆਰਾਮ ਨਾਲ ਪੂਰਾ ਕਰਨ ਵਿੱਚ ਮਦਦ ਕਰਾਂਗੀ। ਜਦੋਂ ਤੁਸੀਂ ਤਿਆਰ ਹੋਵੋ, ਬੱਸ ਆਪਣਾ ਨਾਮ ਦੱਸੋ—ਜਾਂ ਜੇਕਰ ਖੁਦ ਫਾਰਮ ਭਰਨਾ ਚਾਹੁੰਦੇ ਹੋ ਤਾਂ "ਟਾਈਪਿੰਗ" ਕਹੋ।',
    speakText: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, ਗੁਇਨੇਕਸ ਕਲਿਨਿਕ ਵਿੱਚ ਤੁਹਾਡਾ ਸਵਾਗਤ ਹੈ। ਮੈਂ ਅਨੰਨਿਆ ਹਾਂ, ਅਤੇ ਤੁਹਾਡਾ ਚੈੱਕ-ਇਨ ਆਰਾਮ ਨਾਲ ਪੂਰਾ ਕਰਨ ਵਿੱਚ ਮਦਦ ਕਰਾਂਗੀ। ਜਦੋਂ ਤੁਸੀਂ ਤਿਆਰ ਹੋਵੋ, ਬੱਸ ਆਪਣਾ ਨਾਮ ਦੱਸੋ, ਜਾਂ ਜੇਕਰ ਖੁਦ ਫਾਰਮ ਭਰਨਾ ਚਾਹੁੰਦੇ ਹੋ ਤਾਂ ਟਾਈਪਿੰਗ ਕਹੋ।',
  },
  as: {
    text: 'নমস্কাৰ, গুইনেক্স ক্লিনিকলৈ স্বাগতম। মই অনন্যা, আপোনাৰ চেক-ইন সহজতে সম্পন্ন কৰাত সহায় কৰিম। আপুনি সাজু হ’লে কেৱল আপোনাৰ নাম কওক—অথবা নিজেই ফৰ্ম পূৰণ কৰিব বিচাৰিলে "টাইপিং" বুলি কওক।',
    speakText: 'নমস্কাৰ, গুইনেক্স ক্লিনিকলৈ স্বাগতম। মই অনন্যা, আপোনাৰ চেক-ইন সহজতে সম্পন্ন কৰাত সহায় কৰিম। আপুনি সাজু হ’লে কেৱল আপোনাৰ নাম কওক, অথবা নিজেই ফৰ্ম পূৰণ কৰিব বিচাৰিলে টাইপিং বুলি কওক।',
  },
  ur: {
    text: 'خوش آمدید، گوئنیکس کلینک میں آپ کا خیر مقدم ہے۔ میں اننیا ہوں، اور میں آپ کے چیک اِن میں مدد کروں گی۔ جب آپ تیار ہوں، بس اپنا نام بتائیں—یا اگر خود فارم بھرنا چاہتے ہیں تو "ٹائپنگ" کہیں۔',
    speakText: 'خوش آمدید، گوئنیکس کلینک میں آپ کا خیر مقدم ہے۔ میں اننیا ہوں، اور میں آپ کے چیک اِن میں مدد کروں گی۔ جب آپ تیار ہوں، بس اپنا نام بتائیں، یا اگر خود فارم بھرنا چاہتے ہیں تو ٹائپنگ کہیں۔',
  },
  ne: {
    text: 'नमस्ते, गुइनेक्स क्लिनिकमा स्वागत छ। म अनन्या हुँ, तपाईंको चेक-इन सजिलै पूरा गर्न मद्दत गर्नेछु। तयार भएपछि आफ्नो नाम भन्नुहोस्—वा आफैं फारम भर्न चाहनुहुन्छ भने "टाइपिङ" भन्नुहोस्।',
    speakText: 'नमस्ते, गुइनेक्स क्लिनिकमा स्वागत छ। म अनन्या हुँ, तपाईंको चेक-इन सजिलै पूरा गर्न मद्दत गर्नेछु। तयार भएपछि आफ्नो नाम भन्नुहोस्, वा आफैं फारम भर्न चाहनुहुन्छ भने टाइपिङ भन्नुहोस्।',
  },
  sa: {
    text: 'नमस्ते, गुइनेक्स-चिकित्सालये स्वागतम्। अहम् अनन्या अस्मि। सज्जाः सन्ति चेत् कृपया स्वनाम वदन्तु—अथवा स्वयम् एव प्रपत्रं पूरयितुं "टाइपिङ्" इति वदन्तु।',
    speakText: 'नमस्ते, गुइनेक्स-चिकित्सालये स्वागतम्। अहम् अनन्या अस्मि। सज्जाः सन्ति चेत् कृपया स्वनाम वदन्तु, अथवा स्वयम् एव प्रपत्रं पूरयितुं टाइपिङ् इति वदन्तु।',
  },
  mai: {
    text: 'प्रणाम, गुइनेक्स क्लिनिक मे स्वागत अछि। हम अनन्या छी, अहाँक चेक-इन मे मदद करब। तैयार भेला पर बस अपन नाम कहू—वा अपने फॉर्म भरबाक लेल "टाइपिंग" कहू।',
    speakText: 'प्रणाम, गुइनेक्स क्लिनिक मे स्वागत अछि। हम अनन्या छी, अहाँक चेक-इन मे मदद करब। तैयार भेला पर बस अपन नाम कहू, वा अपने फॉर्म भरबाक लेल टाइपिंग कहू।',
  },
  kok: {
    text: 'नमस्कार, गुइनेक्स क्लिनिकांत तुमकां येवकार। हांव अनन्या, तुमचें चेक-इन सोंपें करपाक मदत करतलीं। तयार आसल्यार फकत तुमचें नांव सांगात—वा स्वता फॉर्म भरपाक "टायपिंग" म्हणात।',
    speakText: 'नमस्कार, गुइनेक्स क्लिनिकांत तुमकां येवकार। हांव अनन्या, तुमचें चेक-इन सोंपें करपाक मदत करतलीं। तयार आसल्यार फकत तुमचें नांव सांगात, वा स्वता फॉर्म भरपाक टायपिंग म्हणात।',
  },
  sd: {
    text: 'ڀلي ڪري آيا، گوئنيڪس کلينڪ ۾ توهان جو آڌرڀاءُ آهي. مان اننيا آهيان، ۽ توهان جي چيڪ ان ۾ مدد ڪنديس. تيار هجو ته مهرباني ڪري پنهنجو نالو ٻڌايو—يا فارم ڀرڻ لاءِ "ٽائپنگ" چئو.',
    speakText: 'ڀلي ڪري آيا، گوئنيڪس کلينڪ ۾ توهان جو آڌرڀاءُ آهي. مان اننيا آهيان، ۽ توهان جي چيڪ ان ۾ مدد ڪنديس. تيار هجو ته مهرباني ڪري پنهنجو نالو ٻڌايو، يا فارم ڀرڻ لاءِ ٽائپنگ چئو.',
  },
  doi: {
    text: 'नमस्ते, गुइनेक्स क्लिनिक च तुंदा स्वागत ऐ। मैं अनन्या आं, तुंदे चेक-इन च मदद करांगी। जदूं तैयार होवो, बस अपना नां दस्सो—जा फॉर्म भरने लेई "टाइपिंग" बोलो।',
    speakText: 'नमस्ते, गुइनेक्स क्लिनिक च तुंदा स्वागत ऐ। मैं अनन्या आं, तुंदे चेक-इन च मदद करांगी। जदूं तैयार होवो, बस अपना नां दस्सो, जा फॉर्म भरने लेई टाइपिंग बोलो।',
  },
  mni: {
    text: 'খুরুমজরি, গুইনেক্স ক্লিনিকতা তরাম্না ওকচরি। ঐ অনন্যানি, অদোমগী চেক-ইন লাইনা লোইশিনবদা মতেং পাংগনি। থৌরাং ওইরবদি অদোমগী মমিং হায়বীয়ু—নত্রগা ফোর্ম মেনবা পাম্লবদি "তাইপিং" হায়বীয়ু।',
    speakText: 'খুরুমজরি, গুইনেক্স ক্লিনিকতা তরাম্না ওকচরি। ঐ অনন্যানি, অদোমগী চেক-ইন লাইনা লোইশিনবদা মতেং পাংগনি। থৌরাং ওইরবদি অদোমগী মমিং হায়বীয়ু, নত্রগা ফোর্ম মেনবা পাম্লবদি তাইপিং হায়বীয়ু।',
  },
  sat: {
    text: 'ᱡᱚᱦᱟᱨ, Guinex Clinic ᱨᱮ ᱥᱟᱹᱜᱩᱱ ᱫᱟᱨᱟᱢ᱾ ᱤᱧ Ananya ᱠᱟᱹᱱᱟᱹᱧ᱾ ᱥᱟᱯᱲᱟᱣ ᱞᱮᱱᱠᱷᱟᱱ ᱟᱢᱟᱜ ᱧᱩᱛᱩᱢ ᱞᱟᱹᱭ ᱢᱮ—ᱟᱨᱵᱟᱝ ᱟᱢ ᱛᱮ ᱯᱷᱚᱨᱢ ᱯᱮᱨᱮᱡ ᱞᱟᱹᱜᱤᱫ "typing" ᱢᱮᱱ ᱢᱮ᱾',
    speakText: 'ᱡᱚᱦᱟᱨ, Guinex Clinic ᱨᱮ ᱥᱟᱹᱜᱩᱱ ᱫᱟᱨᱟᱢ᱾ ᱤᱧ Ananya ᱠᱟᱹᱱᱟᱹᱧ᱾ ᱥᱟᱯᱲᱟᱣ ᱞᱮᱱᱠᱷᱟᱱ ᱟᱢᱟᱜ ᱧᱩᱛᱩᱢ ᱞᱟᱹᱭ ᱢᱮ, ᱟᱨᱵᱟᱝ ᱟᱢ ᱛᱮ ᱯᱷᱚᱨᱢ ᱯᱮᱨᱮᱡ ᱞᱟᱹᱜᱤᱫ typing ᱢᱮᱱ ᱢᱮ᱾',
  },
  brx: {
    text: 'खुलुमबाय, Guinex Clinic आव बरायबाय। आं अनन्या। थियारि जाब्ला नोंथांनि मुं खोन्था—एबा गावनो फर्म सुफुंनो सानदोंब्ला "टाइपिं" होन।',
    speakText: 'खुलुमबाय, Guinex Clinic आव बरायबाय। आं अनन्या। थियारि जाब्ला नोंथांनि मुं खोन्था, एबा गावनो फर्म सुफुंनो सानदोंब्ला टाइपिं होन।',
  },
  ks: {
    text: 'خوش آمدید، گوئنیکس کلینکس مَنٛز چھُ تُہُند خیر مقدم। بہٕ چھَس اننیا، تہٕ تُہُند چیک اِن آسٲنی سان مُکمل کَرنَس مَنٛز کَرہٕ مَدَتھ। ییلہِ تۄہؠ تَیار آسِو، پَنُن ناو وَنِو—یا فارم بَرِنہٕ خٲطرٕ وَنِو "ٹائپنگ"۔',
    speakText: 'خوش آمدید، گوئنیکس کلینکس مَنٛز چھُ تُہُند خیر مقدم। بہٕ چھَس اننیا، تہٕ تُہُند چیک اِن آسٲنی سان مُکمل کَرنَس مَنٛز کَرہٕ مَدَتھ। ییلہِ تۄہؠ تَیار آسِو، پَنُن ناو وَنِو، یا فارم بَرِنہٕ خٲطرٕ وَنِو ٹائپنگ۔',
  },
  en: {
    text: 'Hi there, welcome to Guinex Clinic. I\'m Ananya, and I\'ll help get you checked in smoothly. Whenever you\'re ready, just tell me your good name—or say "typing" if you\'d prefer to fill out the form yourself.',
    speakText: 'Hi there, welcome to Guinex Clinic. I am Ananya, and I will help get you checked in smoothly. Whenever you are ready, just tell me your good name, or say typing if you prefer to fill out the form yourself.',
  },
};

const BCP47_TAGS: Record<string, string> = {
  or: 'or-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
  te: 'te-IN',
  ta: 'ta-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  pa: 'pa-IN',
  as: 'as-IN',
  ur: 'ur-IN',
  ne: 'ne-NP',
  sa: 'sa-IN',
  mai: 'mai-IN',
  kok: 'kok-IN',
  sd: 'sd-IN',
  doi: 'doi-IN',
  mni: 'mni-IN',
  sat: 'sat-IN',
  brx: 'brx-IN',
  ks: 'ks-IN',
  en: 'en-IN',
};

const nowMs = () => Date.now();

export const ModeSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language, setLanguage } = useLanguage();

  const urlLang = searchParams.get('lang') as SupportedLanguage;
  const subLang = searchParams.get('sublang') || '';
  const activeLang: SupportedLanguage = (ALL_ANNOUNCEMENTS[urlLang] ? urlLang : (ALL_ANNOUNCEMENTS[language] ? language : 'en')) as SupportedLanguage;

  const lookupKey = subLang || activeLang;
  const announcementData = ALL_ANNOUNCEMENTS[lookupKey] || ALL_ANNOUNCEMENTS[activeLang] || ALL_ANNOUNCEMENTS.en;

  useEffect(() => {
    if (urlLang && ALL_ANNOUNCEMENTS[urlLang] && urlLang !== language) {
      setLanguage(urlLang);
    }
  }, [urlLang, language, setLanguage]);

  // Visual states
  const initialSerialConnected = esp32SerialService.getState().isConnected;
  const [announcementState, setAnnouncementState] = useState<'idle' | 'speaking' | 'listening' | 'processing' | 'recognized'>('idle');
  const announcementStateRef = useRef(announcementState);
  useEffect(() => {
    announcementStateRef.current = announcementState;
  }, [announcementState]);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isHardwareConnected, setIsHardwareConnected] = useState<boolean>(initialSerialConnected);
  const [useLaptopMicFallback, setUseLaptopMicFallback] = useState<boolean>(!initialSerialConnected);
  const [quickName, setQuickName] = useState('');
  const [showQuickName, setShowQuickName] = useState(false);

  // Audio & Hardware References
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const esp32MonitorRef = useRef<Esp32HardwareMonitorRef | null>(null);
  const hardwarePcmBuffersRef = useRef<Float32Array[]>([]);
  const preSpeechChunksRef = useRef<Float32Array[]>([]);
  const hardwareSilenceTimerRef = useRef<any>(null);
  const hardwareMaxDurationTimerRef = useRef<any>(null);
  const hardwareListenStartedAtRef = useRef<number>(0);
  const hardwareCalibSamplesRef = useRef<number[]>([]);
  const hardwareCalibratedRef = useRef<boolean>(false);
  const hardwareNoiseFloorRef = useRef<number>(0.035);
  const manualFinishCaptureRef = useRef<(() => void) | null>(null);
  const hasDetectedSpeechRef = useRef<boolean>(false);
  const isTranscribingRef = useRef<boolean>(false);
  const lastSpeechTimeRef = useRef<number>(0);
  const modeHpfXPrevRef = useRef<number>(0);
  const modeHpfYPrevRef = useRef<number>(0);
  const isNavigatingRef = useRef(false);
  const emptyCaptureCountRef = useRef(0);
  const isAssistantSpeakingRef = useRef(false);
  const speechFrameCountRef = useRef(0);

  // Encode 16-bit Mono WAV Blob from 16kHz PCM
  const encodeWavBlob = (samples: Float32Array, sampleRate: number): Blob => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + samples.length * 2, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  };

  const isTypingIntent = (text: string): boolean => {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    return /(?:typing|type|typed|taip|taiping|taipin|taipig|tiping|tipe|write|writing|written|written\s*mode|manual|manual\s*form|keyboard|form|switch\s*to\s*typing|text\s*mode|i\s*want\s*to\s*type|want\s*typing|prefer\s*typing|likh|likha|likhna|likhe|likho|likhkar|likhi|likhibi|likhiba|lekh|lekha|lekhiba|lekhibi|lekhi|lekhikari|hath\s*se|hathe\s*lekhi|faram|farm|ଲେଖି|ଲେଖିବା|ଲେଖିକରି|ଲେଖିବି|ଲେଖିବୁ|ଲେଖିବାକୁ|ଟାଇପ୍|ଟାଇପ|ଟାଇପିଂ|ଟାଇପିଙ୍ଗ|ଟାଇପିଂଗ|ଫର୍ମ|टाइप|टाइपिंग|टाईपिंग|टाईप|लिखकर|लिखना|लिखे|लिखें|लिखेंगे|लिखूंगा|लिखूंगी|लिखी|हाथ\s*से|मैन्युअल|फॉर्म|লিখে|লিখব|লিখা|লিখিব|টাইপ|টাইপিং|ফরম|ফর্ম|రాయండి|రాయడం|టైపింగ్|టైప్|ఫారమ్|எழுது|எழுதுதல்|டைப்பிங்|டைப்|படிவம்|लिहून|लिहा|टायपिंग|टाईपिंग|टाईप|फॉर्म|લખીને|લખવું|ટાઈપિંગ|ટાઈપ|ફોર્મ|ಬರೆ|ಬರೆಯುವುದು|ಟೈಪಿಂಗ್|ಟೈಪ್|ಫಾರ್ಮ್|എഴുതുക|ടൈപ്പിംഗ്|ടൈപ്പ്|ഫോം|ਲਿਖ|ਲਿਖਣਾ|ਟਾਈਪਿੰਗ|ਟਾਈਪ|ਫਾਰਮ|لکھ\s*کر|لکھনা|ٹائپنگ|ٹائپ|فارم)/i.test(lower);
  };

  const isTalkingIntent = (text: string): boolean => {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    return /(?:talking|talk|bolkar|bol ke|katha|bolna|bolunga|voice|awaaz|audio|speak|speaking|voice\s*agent|voice\s*assistant|assist|assistant|doctor|କଥା|କଥାବାର୍ତ୍ତା|କହିବି|କହିବା|କହିବାକୁ|କଥା\s*କହିବି|बात|बातचीत|बोलना|बोलेंगे|बोलूंगा|बोलूंगी|কথা|কথা\s*বলব|বলব|বলা|మాట్లాడండి|మాట్లాడటం|பேசு|பேசுங்கள்|बोला|बोलकर|બોલો|બોલીને|ಮಾತನಾಡಿ|സംസാരിക്കുക|ਬੋਲੋ|بات\s*کریں|بولیں)/i.test(lower);
  };

  const extractSpokenName = (transcript: string): string => {
    let clean = transcript.trim();
    if (!clean) return '';
    if (isTypingIntent(clean) || isTalkingIntent(clean)) return '';

    const lowerClean = clean.toLowerCase().replace(/[\s.,!?;:।~_/\-'"()[\]{}]+/g, ' ').trim();
    const INVALID_NAMES = new Set([
      'hello', 'hi', 'hey', 'namaste', 'namaskar', 'pranam', 'good morning', 'good afternoon', 'good evening',
      'yes', 'no', 'ok', 'okay', 'talking', 'talk', 'typing', 'type', 'typed', 'taip', 'taiping', 'taipin', 'taipig', 'tiping', 'tipe',
      'voice', 'bolkar', 'likhkar', 'likh', 'likha', 'likhna', 'likhiba', 'lekh', 'lekha', 'lekhiba',
      'katha', 'none', 'null', 'undefined', 'test', 'patient', 'doctor', 'start', 'manual', 'form',
      'keyboard', 'writing', 'write',
      'ନମସ୍କାର', 'ପ୍ରଣାମ', 'ହଁ', 'ନା', 'ହେଲୋ', 'ହାଏ', 'କଥା', 'ଲେଖିବା', 'ଲେଖି', 'ଟାଇପିଙ୍ଗ', 'ଟାଇପିଂ', 'ଟାଇପ୍', 'ଟାଇପ', 'ଫର୍ମ',
      'नमस्ते', 'नमस्कार', 'प्रणाम', 'हाँ', 'ना', 'बोलकर', 'लिखकर', 'टाइप', 'टाइपिंग', 'टाईपिंग', 'टाईप', 'लिखना', 'फॉर्म',
      'টাইপ', 'টাইপিং', 'লিখে', 'লিখব', 'ফরম', 'ফর্ম', 'టైపింగ్', 'టైప్', 'రాయండి', 'டைப்பிங்', 'டைப்', 'எழுது', 'टायपिंग'
    ]);

    if (INVALID_NAMES.has(lowerClean) || isTypingIntent(lowerClean) || isTalkingIntent(lowerClean) || lowerClean.length < 2 || lowerClean.length > 30) {
      return '';
    }

    if (/^(?:hello|hi|hey|namaste|namaskar|pranam|ok|okay|yes|no)\b/i.test(lowerClean) && lowerClean.split(/\s+/).length <= 2) {
      return '';
    }

    clean = clean.replace(/^(?:my name is|i am|this is|mera naam hai|mera naam|naam hai|naam|mo naa|mote|mate|amar naam|na peru|yen peyar|mazhe nav|maru naam|nanna hesaru|ente peru|ମୋର ନାମ|ମୋ ନାମ|ମୋ ନାଁ|ମୋର ପୂରା ନାମ|ମୁଁ|ମୁଁ ହେଉଛି|मेरा नाम है|मेरा नाम|नाम है|नाम)\s+/i, '');
    clean = clean.replace(/\s+(?:achi|heuchi|hela|bolte|hai|hun|hoon|agyan|sir|ji|garu|avargal|ହେଲା|ଅଟେ|ବାବୁ|ଆଜ୍ଞା|है|हूँ|हूं|अछि|आहे|છે|ఉంది|ಇದೆ|ആണ്|is|are|am)$/i, '');
    clean = clean.trim().replace(/^[,.।!?]+|[,.।!?]+$/g, '');

    const finalLower = clean.toLowerCase();
    if (INVALID_NAMES.has(finalLower) || isTypingIntent(clean) || isTalkingIntent(clean) || clean.length < 2 || clean.length > 30) {
      return '';
    }
    // Reject if it contains numbers or age/gender words
    if (/\d|[୦-୯]|[०-९]/.test(clean) || /(?:ବୟସ|ଲିଙ୍ଗ|ପୁରୁଷ|ମହିଳା|उम्र|लिंग|पुरुष|महिला|age|gender|male|female)/i.test(clean)) {
      return '';
    }
    return clean;
  };

  const proceedToTyping = () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    stopGlobalAudio();
    setStatusMessage(
      activeLang === 'or' ? 'ଲେଖିବା ଫର୍ମ ଖୋଲାଯାଉଛି...' :
        activeLang === 'hi' ? 'मैन्युअल फॉर्म खोला जा रहा है...' :
          'Opening manual form...'
    );
    navigate(`/patient/assessment?mode=manual&lang=${activeLang}`);
  };

  const proceedToVoice = (capturedName?: string) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    stopGlobalAudio();
    const nameParam = capturedName && capturedName.length > 1 ? `&name=${encodeURIComponent(capturedName)}` : '';
    setStatusMessage(
      activeLang === 'or' ? 'ଭଏସ୍ ମୋଡ୍ ଆରମ୍ଭ ହେଉଛି...' :
        activeLang === 'hi' ? 'वॉयस मोड शुरू हो रहा है...' :
          'Starting voice mode...'
    );
    navigate(`/patient/assessment?mode=voice&lang=${activeLang}${nameParam}`);
  };

  const clearHardwareTimers = () => {
    if (hardwareSilenceTimerRef.current) {
      clearTimeout(hardwareSilenceTimerRef.current);
      hardwareSilenceTimerRef.current = null;
    }
    if (hardwareMaxDurationTimerRef.current) {
      clearTimeout(hardwareMaxDurationTimerRef.current);
      hardwareMaxDurationTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (announcementState === 'listening') {
      hardwareListenStartedAtRef.current = nowMs();
      hardwareCalibSamplesRef.current = [];
      hardwareCalibratedRef.current = false;
      hardwareNoiseFloorRef.current = 0.035;
      hasDetectedSpeechRef.current = false;
      speechFrameCountRef.current = 0;
    }
  }, [announcementState]);

  const cleanTranscriptFallbackName = (raw: string): string => {
    const localParsed = extractSpokenName(raw);
    if (localParsed && localParsed.length >= 2) return localParsed;
    const stripped = raw
      .replace(/^(?:my name is|i am|this is|mera naam hai|mera naam|naam hai|naam|mo naa|ମୋର ନାମ|ମୋ ନାମ|ମୋ ନାଁ|ମୁଁ|मेरा नाम है|मेरा नाम)\s+/i, '')
      .replace(/\s+(?:hai|hun|hoon|is|am|ଆଜ୍ଞା|ବାବୁ|जी)$/i, '')
      .replace(/[^\p{L}\p{M}\s.-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (stripped.length >= 2 && stripped.length <= 35 && !isTypingIntent(stripped) && !isTalkingIntent(stripped)) {
      return stripped;
    }
    return '';
  };

  const processRecognizedTranscript = async (rawText: string): Promise<boolean> => {
    const clean = rawText.trim();
    if (!clean || clean.toUpperCase() === 'EMPTY' || isNavigatingRef.current) return false;
    setLiveTranscript(clean);

    const lower = clean.toLowerCase();
    if (
      lower.includes('typing') ||
      /\btype\b/i.test(lower) ||
      lower.includes('form') ||
      clean.includes('लिख') ||
      isTypingIntent(clean)
    ) {
      setAnnouncementState('recognized');
      isNavigatingRef.current = true;
      stopGlobalAudio();
      navigate(`/patient/assessment?lang=${activeLang}&mode=manual`);
      return true;
    }

    setAnnouncementState('processing');
    setStatusMessage(
      activeLang === 'or' ? 'ଆପଣଙ୍କ ନାମ ଚିହ୍ନଟ ହେଉଛି...' :
        activeLang === 'hi' ? 'आपका नाम समझा जा रहा है...' :
          'Getting everything ready for you...'
    );

    let finalName = '';
    try {
      const targetLang = subLang || activeLang;
      const aiRes = await Promise.race([
        analyzeVoiceIntake({
          transcript: clean,
          step: 1,
          language: targetLang,
          patient_name: '',
          current_slot: 'name',
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
      ]);
      if (aiRes && aiRes.name && aiRes.name.trim().length >= 2) {
        finalName = aiRes.name.trim();
      }
    } catch (err) {
      console.warn('Name extraction intake call failed on ModeSelectionPage:', err);
    }

    if (finalName.length < 2) {
      finalName = cleanTranscriptFallbackName(clean);
    }

    setAnnouncementState('recognized');
    isNavigatingRef.current = true;
    stopGlobalAudio();
    if (finalName.length >= 2) {
      navigate(`/patient/assessment?lang=${activeLang}&mode=voice&name=${encodeURIComponent(finalName)}`);
    } else {
      navigate(`/patient/assessment?lang=${activeLang}&mode=voice`);
    }
    return true;
  };

  // Hardware audio chunk processor (ESP32 INMP441 Microphone over USB Serial)
  const handleIncomingHardwareAudioChunk = (b64Pcm: string, _isSpeaking: boolean) => {
    if (announcementStateRef.current !== 'listening' || isTranscribingRef.current || isNavigatingRef.current || isAssistantSpeakingRef.current) return;

    try {
      const raw = atob(b64Pcm);
      const u8 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
      const i16 = new Int16Array(u8.buffer);
      const f32 = new Float32Array(i16.length);

      const alpha = 0.963;
      let hpX = modeHpfXPrevRef.current;
      let hpY = modeHpfYPrevRef.current;
      let sumSq = 0;

      for (let i = 0; i < i16.length; i++) {
        const x = i16[i] / 32768.0;
        const y = x - hpX + alpha * hpY;
        hpX = x;
        hpY = y;
        const clamped = Math.max(-1.0, Math.min(1.0, y));
        f32[i] = clamped;
        sumSq += clamped * clamped;
      }
      modeHpfXPrevRef.current = hpX;
      modeHpfYPrevRef.current = hpY;

      const chunkRms = Math.sqrt(sumSq / f32.length);
      const now = nowMs();
      if (!hardwareListenStartedAtRef.current) {
        hardwareListenStartedAtRef.current = now;
      }

        // First 400ms: calibrate ambient noiseFloor = clamp(avgRms * 1.6, 0.025, 0.08)
        const elapsed = now - hardwareListenStartedAtRef.current;
        if (elapsed < 400) {
          hardwareCalibSamplesRef.current.push(chunkRms);
          const avgRms = hardwareCalibSamplesRef.current.reduce((a, b) => a + b, 0) / hardwareCalibSamplesRef.current.length;
          hardwareNoiseFloorRef.current = Math.min(0.08, Math.max(0.025, avgRms * 1.6));
        } else if (!hardwareCalibratedRef.current) {
          hardwareCalibratedRef.current = true;
          if (hardwareCalibSamplesRef.current.length > 0) {
            const avgRms = hardwareCalibSamplesRef.current.reduce((a, b) => a + b, 0) / hardwareCalibSamplesRef.current.length;
            hardwareNoiseFloorRef.current = Math.min(0.08, Math.max(0.025, avgRms * 1.6));
          }
        }

        // Strict un-resettable 5000ms total hard stop
        if (!hardwareMaxDurationTimerRef.current) {
          const remaining = Math.max(500, 5000 - elapsed);
          hardwareMaxDurationTimerRef.current = setTimeout(() => {
              clearHardwareTimers();
              if (isTranscribingRef.current || isNavigatingRef.current) return;
              if (hardwarePcmBuffersRef.current.length > 3) {
                void finishHardwareUtterance();
              } else if (preSpeechChunksRef.current.length > 3) {
                hardwarePcmBuffersRef.current.push(...preSpeechChunksRef.current);
                preSpeechChunksRef.current = [];
                void finishHardwareUtterance();
              } else {
                emptyCaptureCountRef.current += 1;
                setShowQuickName(true);
                setStatusMessage(
                  activeLang === 'hi'
                    ? 'कृपया नीचे अपना नाम लिखें या दोबारा बोलें'
                    : 'Take your time — type your name below or tap the mic to try again.'
                );
              }
        }, remaining);
      }

      const isChunkSpeech = chunkRms > hardwareNoiseFloorRef.current;

      if (isChunkSpeech) {
        if (!hasDetectedSpeechRef.current) {
          hasDetectedSpeechRef.current = true;
          if (preSpeechChunksRef.current.length > 0) {
            hardwarePcmBuffersRef.current.push(...preSpeechChunksRef.current);
            preSpeechChunksRef.current = [];
          }
        }
        lastSpeechTimeRef.current = now;
        hardwarePcmBuffersRef.current.push(f32);
        setAudioLevel(Math.min(100, Math.max(15, Math.round(chunkRms * 350))));

        if (hardwareSilenceTimerRef.current) {
          clearTimeout(hardwareSilenceTimerRef.current);
        }
        // Auto-stop after 1000ms of continuous silence once speech has started
        hardwareSilenceTimerRef.current = setTimeout(() => {
          if (hasDetectedSpeechRef.current && hardwarePcmBuffersRef.current.length > 3 && !isTranscribingRef.current) {
            void finishHardwareUtterance();
          }
      }, 1000);
    } else if (hasDetectedSpeechRef.current) {
      hardwarePcmBuffersRef.current.push(f32);
        if (now - lastSpeechTimeRef.current >= 1000 && hardwarePcmBuffersRef.current.length > 3 && !isTranscribingRef.current) {
          clearHardwareTimers();
          void finishHardwareUtterance();
        }
      } else {
        preSpeechChunksRef.current.push(f32);
          if (preSpeechChunksRef.current.length > 8) {
            preSpeechChunksRef.current.shift();
          }
        }
      } catch (e) {
        console.warn('Hardware audio chunk decode error:', e);
      }
    };

    const finishHardwareUtterance = async () => {
      clearHardwareTimers();
      if (isTranscribingRef.current || isNavigatingRef.current) return;
      if (hardwarePcmBuffersRef.current.length === 0 && preSpeechChunksRef.current.length > 0) {
        hardwarePcmBuffersRef.current.push(...preSpeechChunksRef.current);
      }
      if (hardwarePcmBuffersRef.current.length === 0) return;

      isTranscribingRef.current = true;
      preSpeechChunksRef.current = [];

      let total = 0;
      for (const b of hardwarePcmBuffersRef.current) total += b.length;
      const flat = new Float32Array(total);
      let offset = 0;
      for (const b of hardwarePcmBuffersRef.current) {
        flat.set(b, offset);
        offset += b.length;
      }
      hardwarePcmBuffersRef.current = [];
      hasDetectedSpeechRef.current = false;
      speechFrameCountRef.current = 0;

      if (flat.length < 1600) {
        isTranscribingRef.current = false;
        emptyCaptureCountRef.current += 1;
        if (emptyCaptureCountRef.current >= 2) {
          setShowQuickName(true);
          setStatusMessage(
            activeLang === 'hi'
              ? 'आवाज़ साफ़ नहीं आई — कृपया नीचे अपना नाम लिखें या माइक पर क्लिक करें'
              : 'Voice was not clear — type your name below or click the microphone.'
          );
          setAnnouncementState('recognized');
        }
        return;
      }

      setAnnouncementState('processing');
      setStatusMessage(
      activeLang === 'or' ? 'ଆପଣଙ୍କ କଥା ବୁଝାଯାଉଛି...' :
          activeLang === 'hi' ? 'आपकी आवाज़ समझी जा रही है...' :
            'Listening to what you said...'
      );

      try {
        const wavBlob = encodeWavBlob(flat, 16000);
        const sttLang = subLang || activeLang;
        const res = await transcribeSpeech(wavBlob, sttLang);

          const rawTranscript = (res?.transcript || '').trim();
          if (rawTranscript && rawTranscript.toUpperCase() !== 'EMPTY') {
            emptyCaptureCountRef.current = 0;
            setShowQuickName(false);
            const handled = await processRecognizedTranscript(rawTranscript);
            if (handled) return;
          }
        } catch (e) {
          console.warn('Hardware STT error:', e);
        } finally {
          isTranscribingRef.current = false;
        }

        if (!isNavigatingRef.current) {
          emptyCaptureCountRef.current += 1;
          if (emptyCaptureCountRef.current >= 2) {
            setShowQuickName(true);
            setStatusMessage(
              activeLang === 'hi'
                ? 'आवाज़ साफ़ नहीं आई — कृपया नीचे अपना नाम लिखें या माइक पर क्लिक करें'
                : 'Voice was not clear — type your name below or click the microphone.'
            );
            setAnnouncementState('recognized');
            return;
          }
          setAnnouncementState('listening');
          setStatusMessage('');
        }
      };

      const continueWithQuickName = () => {
        const name = quickName.trim();
        if (name.length < 2) return;
        proceedToVoice(name);
      };

      // Play audio announcement with strict anti-overlap session validation
      const playAnnouncement = async () => {
        // 1. Terminate any previous audio across the app and claim a fresh session ID
        stopGlobalAudio();
        const sessionId = getAudioSessionId();

        setAnnouncementState('speaking');
        setStatusMessage(
          activeLang === 'or' ? 'ନିର୍ଦ୍ଦେଶ ଶୁଣାଉଛି...' :
            activeLang === 'hi' ? 'निर्देश सुनाया जा रहा है...' :
              'Announcing instructions...'
        );

        const textToSpeak = announcementData.speakText;

        try {
          const savedSarvamKey = localStorage.getItem('jansaathi_sarvam_key') || undefined;
          const ttsLang = subLang || activeLang;
          const res = await synthesizeSpeech(textToSpeak, ttsLang, savedSarvamKey, undefined, 'sarvam');

          // Check if session is still valid (stops audio if user navigated or changed language during fetch!)
          if (!isSessionActive(sessionId) || isNavigatingRef.current) {
            return;
          }

          if (res && res.status === 'success' && res.audio) {
            const mimeType = res.format || (res.provider === 'sarvam' ? 'audio/wav' : 'audio/mp3');
            const binary = atob(res.audio.replace(/[\s\r\n]+/g, ''));
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
            const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
            const audio = new Audio(blobUrl);
            registerActiveAudio(audio);
            audioRef.current = audio;

            audio.onended = () => {
              if (isSessionActive(sessionId) && !isNavigatingRef.current) {
                isAssistantSpeakingRef.current = false;
                URL.revokeObjectURL(blobUrl);
                window.setTimeout(() => {
                  if (isSessionActive(sessionId) && !isNavigatingRef.current) setAnnouncementState('listening');
                }, 350);
              }
            };
            audio.onerror = () => {
              if (isSessionActive(sessionId) && !isNavigatingRef.current) {
                isAssistantSpeakingRef.current = false;
                URL.revokeObjectURL(blobUrl);
                setAnnouncementState('listening');
              }
            };
            isAssistantSpeakingRef.current = true;
            await audio.play();
            return;
          }
        } catch (e) {
          console.warn('Sarvam TTS error, falling back to browser synthesis:', e);
        }

        if (isSessionActive(sessionId) && !isNavigatingRef.current) {
          fallbackBrowserSpeak(textToSpeak, sessionId);
        }
      };

      const fallbackBrowserSpeak = (text: string, sessionId: number) => {
        if (!isSessionActive(sessionId) || isNavigatingRef.current) return;
        isAssistantSpeakingRef.current = true;

        if ('speechSynthesis' in window) {
          try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            activeUtteranceRef.current = utterance; // Retain reference to prevent garbage-collection cutoffs
            const bcpTag = BCP47_TAGS[lookupKey] || BCP47_TAGS[activeLang] || 'en-IN';
            utterance.lang = bcpTag;
            utterance.rate = 0.95;

            // Pick warmest non-robotic regional voice if available in the browser
            const voices = window.speechSynthesis.getVoices() || [];
            const targetPrefix = bcpTag === 'or-IN' ? 'hi' : bcpTag.slice(0, 2).toLowerCase();
            const allowedNames = ['Google हिन्दी', 'Google UK English Female', 'Microsoft Swara', 'Microsoft Neerja'];
            const match = voices.find((v) => allowedNames.some((name) => v.name.includes(name)) && v.lang.toLowerCase().startsWith(targetPrefix));
            if (!match) {
              isAssistantSpeakingRef.current = false;
              setAnnouncementState('listening');
              return;
            }
            utterance.voice = match;

            let started = false;
            const autoplayWatchdog = setTimeout(() => {
              if (!started && isSessionActive(sessionId) && !isNavigatingRef.current) {
                try { window.speechSynthesis.cancel(); } catch { }
                activeUtteranceRef.current = null;
                setAnnouncementState('listening');
              }
            }, 900);

            utterance.onstart = () => {
              started = true;
              clearTimeout(autoplayWatchdog);
            };
            utterance.onend = () => {
              clearTimeout(autoplayWatchdog);
              activeUtteranceRef.current = null;
              if (isSessionActive(sessionId) && !isNavigatingRef.current) {
                isAssistantSpeakingRef.current = false;
                window.setTimeout(() => setAnnouncementState('listening'), 350);
              }
            };
            utterance.onerror = () => {
              clearTimeout(autoplayWatchdog);
              activeUtteranceRef.current = null;
              isAssistantSpeakingRef.current = false;
              if (isSessionActive(sessionId) && !isNavigatingRef.current) {
                setAnnouncementState('listening');
              }
            };
            window.speechSynthesis.speak(utterance);
            return;
          } catch { }
        }
        setAnnouncementState('listening');
      };

      const playAnnouncementRef = useRef(playAnnouncement);
      const proceedToTypingRef = useRef(proceedToTyping);
      const proceedToVoiceRef = useRef(proceedToVoice);

      useEffect(() => {
        playAnnouncementRef.current = playAnnouncement;
        proceedToTypingRef.current = proceedToTyping;
        proceedToVoiceRef.current = proceedToVoice;
      });

      // Auto-play announcement on page load with anti-overlap cleanup
      useEffect(() => {
        stopGlobalAudio();

        const timer = setTimeout(() => {
          playAnnouncementRef.current().catch(() => {
            setAnnouncementState('listening');
          });
        }, 250);

        return () => {
          clearTimeout(timer);
          clearHardwareTimers();
          stopGlobalAudio();
        };
      }, [lookupKey]);

      // Browser Speech Recognition + Adaptive MediaRecorder STT Fallback when ESP32 is not connected
      const processTranscriptRef = useRef(processRecognizedTranscript);
      useEffect(() => {
        processTranscriptRef.current = processRecognizedTranscript;
      });

      useEffect(() => {
        if (!useLaptopMicFallback || isHardwareConnected) return;
        if (announcementState !== 'listening') {
          manualFinishCaptureRef.current = null;
          return;
        }

        let cancelled = false;
        let rec: any = null;
        let stream: MediaStream | null = null;
        let audioCtx: AudioContext | null = null;
        let recorder: MediaRecorder | null = null;
        let animFrameId: number | null = null;
        let vadSilenceTimer: ReturnType<typeof setTimeout> | null = null;
        let hardStopTimer: ReturnType<typeof setTimeout> | null = null;
        let restartTimer: ReturnType<typeof setTimeout> | null = null;
        let webSpeechTranscript = '';

        const cleanupMedia = () => {
          manualFinishCaptureRef.current = null;
          if (vadSilenceTimer) { clearTimeout(vadSilenceTimer); vadSilenceTimer = null; }
          if (hardStopTimer) { clearTimeout(hardStopTimer); hardStopTimer = null; }
          if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
          if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null; }
          if (recorder && recorder.state === 'recording') {
            try { recorder.stop(); } catch { }
          }
          if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            stream = null;
          }
          if (audioCtx) {
            try { audioCtx.close().catch(() => { }); } catch { }
            audioCtx = null;
          }
        };

        const startAdaptiveCapture = async () => {
          if (cancelled || !navigator.mediaDevices?.getUserMedia) return;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
            if (cancelled) {
              stream.getTracks().forEach((t) => t.stop());
              stream = null;
              return;
            }

            const chunks: Blob[] = [];
            const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/wav';
            recorder = new MediaRecorder(stream, { mimeType: mime });
            recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) chunks.push(e.data);
            };

            let isFinishing = false;
            let hasSpoken = false;
            let lastVoiceTime = 0;
            let noiseFloor = 0.035;
            const noiseSamples: number[] = [];
            const listenStartedAt = nowMs();

            const finishCapture = async () => {
              if (cancelled || isFinishing) return;
              isFinishing = true;
              if (vadSilenceTimer) { clearTimeout(vadSilenceTimer); vadSilenceTimer = null; }
              if (hardStopTimer) { clearTimeout(hardStopTimer); hardStopTimer = null; }
              if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null; }
              try { rec?.stop(); } catch { }

              const stopped =
                recorder && recorder.state === 'recording'
                  ? new Promise<void>((resolve) => {
                    const t = setTimeout(resolve, 450);
                    recorder!.onstop = () => {
                      clearTimeout(t);
                      resolve();
                    };
                    try { recorder!.stop(); } catch { clearTimeout(t); resolve(); }
                  })
                  : Promise.resolve();

              await stopped;
              cleanupMedia();
              if (cancelled || isNavigatingRef.current) return;

              const blob = new Blob(chunks, { type: mime });
              let transcript = '';
              if (blob.size > 1200) {
                setAnnouncementState('processing');
                setStatusMessage(
                  activeLang === 'or' ? 'ଆପଣଙ୍କ କଥା ବୁଝାଯାଉଛି...' :
                    activeLang === 'hi' ? 'आपकी आवाज़ समझी जा रही है...' :
                      'Listening to what you said...'
                );
                try {
                  const sttRes = await transcribeSpeech(blob, lookupKey || activeLang);
                    const candidate = (sttRes?.transcript || '').trim();
                    if (candidate && candidate.toUpperCase() !== 'EMPTY') {
                      transcript = candidate;
                    }
                  } catch (err) {
                    console.warn('Laptop STT fallback error on ModeSelectionPage:', err);
                  }
                }

                  // Zero-latency Web Speech backup if backend returned empty / "EMPTY"
                  if (!transcript && webSpeechTranscript.trim()) {
                    transcript = webSpeechTranscript.trim();
                  }

                  if (transcript && (await processTranscriptRef.current(transcript))) {
                    return;
                  }

                  emptyCaptureCountRef.current += 1;
                  if (emptyCaptureCountRef.current >= 2) {
                    setShowQuickName(true);
                    setStatusMessage(
                      activeLang === 'hi'
                        ? 'आवाज़ साफ़ नहीं आई — कृपया नीचे अपना नाम लिखें या माइक पर क्लिक करें'
                : 'Voice was not clear — type your name below or tap the mic.'
            );
setAnnouncementState('recognized');
return;
          }

  setAnnouncementState('listening');
  if (!cancelled && !isNavigatingRef.current) {
    restartTimer = setTimeout(() => {
      if (!cancelled && !isNavigatingRef.current && announcementStateRef.current === 'listening') {
        startAdaptiveCapture();
      }
    }, 250);
  }
};

manualFinishCaptureRef.current = () => {
  void finishCapture();
};

// Strict un-resettable 5000ms hard stop regardless of background noise
hardStopTimer = setTimeout(() => {
  void finishCapture();
}, 5000);

const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
if (AudioCtx) {
  audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => { });
  }
  const src = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  src.connect(analyser);
  const timeData = new Uint8Array(analyser.fftSize);

  const tick = () => {
    if (cancelled || isFinishing || announcementStateRef.current !== 'listening') return;
    analyser.getByteTimeDomainData(timeData);
    let sumSq = 0;
    for (let i = 0; i < timeData.length; i++) {
      const s = (timeData[i] - 128) / 128.0;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / timeData.length);
    const now = nowMs();

    setAudioLevel(Math.min(100, Math.round(rms * 400)));

      if (now - listenStartedAt < 400) {
        noiseSamples.push(rms);
        const avgRms = noiseSamples.reduce((a, b) => a + b, 0) / noiseSamples.length;
        noiseFloor = Math.min(0.08, Math.max(0.025, avgRms * 1.6));
      } else if (rms > noiseFloor) {
        hasSpoken = true;
        lastVoiceTime = now;
        if (vadSilenceTimer) { clearTimeout(vadSilenceTimer); vadSilenceTimer = null; }
      }

        if (now - listenStartedAt >= 5000) {
          void finishCapture();
          return;
        }

        if (hasSpoken && now - lastVoiceTime >= 1000 && !vadSilenceTimer) {
          vadSilenceTimer = setTimeout(() => {
            void finishCapture();
          }, 40);
        }
        animFrameId = requestAnimationFrame(tick);
      };
      tick();
    }

    recorder.start(200);
  } catch (err) {
    console.warn('Adaptive laptop mic capture failed on ModeSelectionPage:', err);
  }
};

startAdaptiveCapture();

const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const bcpTag = BCP47_TAGS[lookupKey] || BCP47_TAGS[activeLang] || 'en-IN';
  if (SpeechRec) {
    try {
      rec = new SpeechRec();
      rec.lang = bcpTag === 'or-IN' ? 'hi-IN' : bcpTag;
      rec.continuous = true;
      rec.interimResults = true;
      registerActiveSpeechRecognition(rec);

      rec.onresult = (evt: any) => {
        let transcript = '';
        let hasFinal = false;
        for (let i = 0; i < evt.results.length; i++) {
          transcript += evt.results[i][0].transcript;
          if (evt.results[i].isFinal) hasFinal = true;
        }
        const text = transcript.trim();
        if (!text) return;
        webSpeechTranscript = text;
        setLiveTranscript(text);
        // Do NOT reset hardStopTimer; trigger completion cleanly once Web Speech finalizes
        if (hasFinal && manualFinishCaptureRef.current) {
          manualFinishCaptureRef.current();
        }
      };

      rec.onerror = () => { };
      rec.start();
    } catch (e) {
      console.warn('Browser mic listener on ModeSelectionPage failed:', e);
    }
  }

  return () => {
    cancelled = true;
    cleanupMedia();
    if (rec) {
      try { rec.abort(); } catch { }
      try { rec.stop(); } catch { }
    }
  };
}, [announcementState, activeLang, lookupKey, useLaptopMicFallback, isHardwareConnected]);


return (
  <div className="min-h-[85vh] flex flex-col justify-start items-center py-6 px-4 sm:px-6">
    {/* Hardware Monitor running in compact mode to stream ESP32 USB Serial Audio */}
    <div className="w-full max-w-4xl mb-4">
      <Esp32HardwareMonitor
        ref={esp32MonitorRef}
        compact={true}
        onConnectionChange={(conn) => {
          setIsHardwareConnected(conn);
          setUseLaptopMicFallback(!conn);
        }}
        onMicLevelUpdate={(lvl, spk) => {
          setAudioLevel(lvl);
          if (
            announcementStateRef.current === 'listening' &&
            hasDetectedSpeechRef.current &&
            !spk &&
            !isTranscribingRef.current &&
            !isNavigatingRef.current &&
            Date.now() - lastSpeechTimeRef.current >= 1000 &&
            hardwarePcmBuffersRef.current.length > 3
          ) {
            void finishHardwareUtterance();
          }
        }}
        onHardwareAudioChunk={(b64Pcm, isSpeaking) => {
          handleIncomingHardwareAudioChunk(b64Pcm, isSpeaking);
        }}
      />
    </div>

    {/* Top Header Row */}
    <div className="w-full max-w-4xl mb-5 flex items-center justify-between">
      <Link
        to="/patient/language"
        onClick={() => stopGlobalAudio()}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-inkmute hover:text-ink transition-colors px-3 py-1.5 rounded-full bg-ink/5 hover:bg-ink/10"
      >
        <iconify-icon icon="ph:arrow-left-bold" width="13" height="13"></iconify-icon>
        <span>Change Language / ଭାଷା ବଦଳାନ୍ତୁ</span>
      </Link>

      {/* Exclusive Hardware Mic Status Pill */}
      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-bold ${isHardwareConnected
          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
          : 'bg-rose-50 border-rose-300 text-rose-800'
          }`}>
          <span className={`w-2 h-2 rounded-full ${isHardwareConnected ? 'bg-emerald-600 animate-pulse' : 'bg-rose-500'}`} />
          <iconify-icon icon="ph:cpu-bold" width="15" height="15"></iconify-icon>
          <span>
            {isHardwareConnected
              ? 'ESP32 INMP441 Hardware Mic: Connected'
              : 'ESP32 Hardware Mic: Disconnected'}
          </span>
          <span className="text-[10px] bg-ink/10 px-2 py-0.5 rounded text-ink font-semibold">
            {isHardwareConnected ? 'Hardware Mic Active' : 'Browser Mic Active'}
          </span>
        </div>

        {!isHardwareConnected && (
          <button
            type="button"
            onClick={() => esp32MonitorRef.current?.connect()}
            className="px-3 py-1.5 rounded-full bg-ink text-cream hover:bg-magenta text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <iconify-icon icon="ph:plugs-connected-bold" width="14" height="14"></iconify-icon>
            <span>Connect ESP32 USB</span>
          </button>
        )}
      </div>
    </div>

    {/* Main Mode Selection Card */}
    <div className="w-full max-w-4xl bg-creamdeep/40 rounded-3xl p-6 sm:p-10 border border-ink/10 shadow-sm text-center">
      {/* Animated Sound Wave or Hardware Mic Visualizer */}
      <div className="flex justify-center items-center mb-5">
        <div className="relative">
          {announcementState === 'speaking' && (
            <span className="absolute -inset-3 rounded-full bg-magenta/20 animate-ping" />
          )}
          {announcementState === 'listening' && (
            <span className="absolute -inset-3 rounded-full bg-emerald-500/20 animate-pulse" />
          )}
          <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-md transition-all ${announcementState === 'speaking' ? 'bg-magenta text-cream' :
            announcementState === 'listening' ? (isHardwareConnected ? 'bg-emerald-600 text-cream scale-105' : 'bg-ink text-cream') :
              announcementState === 'processing' ? 'bg-blue-600 text-cream animate-pulse' :
                'bg-ink text-cream'
            }`}>
            <iconify-icon
              icon={announcementState === 'listening' ? 'ph:microphone-stage-fill' : 'ph:speaker-high-fill'}
              width="28"
              height="28"
            ></iconify-icon>
          </div>
        </div>
      </div>

      {/* Live Status Badge */}
      <div className="mb-4">
        <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold ${announcementState === 'speaking' ? 'bg-magenta/15 text-magenta' :
          announcementState === 'listening' ? (isHardwareConnected ? 'bg-emerald-100 text-emerald-800 animate-pulse' : 'bg-amber-100 text-amber-900') :
            announcementState === 'processing' ? 'bg-blue-100 text-blue-800' :
              announcementState === 'recognized' ? 'bg-emerald-100 text-emerald-800' :
                'bg-ink/10 text-ink'
          }`}>
          <span className={`w-2 h-2 rounded-full ${announcementState === 'speaking' ? 'bg-magenta' :
            announcementState === 'listening' ? (isHardwareConnected ? 'bg-emerald-600' : 'bg-amber-500') :
              'bg-ink'
            }`} />
          {announcementState === 'speaking' && (
              activeLang === 'or' ? 'ଅନନ୍ୟା ଆପଣଙ୍କୁ ସ୍ୱାଗତ କରୁଛନ୍ତି...' :
          activeLang === 'hi' ? 'अनन्या आपका स्वागत कर रही हैं...' :
          'Ananya is welcoming you...'
            )}
          {announcementState === 'listening' && (
              activeLang === 'or' ? 'ଶୁଣୁଛି: ନିଜ ନାମ କୁହନ୍ତୁ କିମ୍ବା "Typing" କୁହନ୍ତୁ...' :
          activeLang === 'hi' ? 'सुन रही हूँ: अपना नाम बोलें या "टाइपिंग" कहें...' :
          'Listening: Say your good name or say "typing"...'
            )}
          {announcementState === 'processing' && (
              statusMessage || 'Getting everything ready for you...'
            )}
          {announcementState === 'recognized' && (
            statusMessage || 'Opening selected mode...'
          )}
        </span>
      </div>

      {/* Manual Done Speaking / Submit button so user never gets stuck waiting on silence */}
      {announcementState === 'listening' && (
        <div className="mb-4 flex justify-center">
          <button
            type="button"
            onClick={() => {
              if (isHardwareConnected) {
                void finishHardwareUtterance();
              } else if (manualFinishCaptureRef.current) {
                manualFinishCaptureRef.current();
              }
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-md transition-all cursor-pointer active:scale-95"
          >
            <span>
              {activeLang === 'hi'
                ? 'बोलना पूरा हुआ — भेजें ✓'
                : activeLang === 'or'
                  ? 'କହିବା ସରିଲା — ପଠାନ୍ତୁ ✓'
                  : 'Tap to Send / Done Speaking ✓'}
            </span>
          </button>
        </div>
      )}

      {/* Live Audio Level Meter for ESP32 Mic - Only active when hardware connected */}
      {isHardwareConnected && announcementState === 'listening' && (
        <div className="w-full max-w-xs mx-auto mb-5">
          <div className="flex justify-between items-center text-[10px] text-inkmute font-semibold mb-1">
            <span>INMP441 Mic Level</span>
            <span>{audioLevel}%</span>
          </div>
          <div className="h-1.5 bg-ink/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-75 rounded-full"
              style={{ width: `${Math.min(100, audioLevel)}%` }}
            />
          </div>
        </div>
      )}

      {/* Helpful Disconnected Info Alert */}
      {!isHardwareConnected && (
        <div className="w-full max-w-xl mx-auto mb-5 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-wrap items-center justify-between gap-2.5 text-left">
          <div className="flex items-center gap-2">
            <iconify-icon icon="ph:warning-circle-bold" width="18" height="18" className="text-amber-600 shrink-0"></iconify-icon>
            <span>
              <strong>ESP32 Hardware Mic is disconnected:</strong> Plug in the USB cable to use hands-free voice mode, or choose an option below.
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => esp32MonitorRef.current?.connect()}
              className="px-3 py-1 rounded-xl bg-ink text-cream hover:bg-magenta text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <iconify-icon icon="ph:plugs-connected-bold" width="13" height="13"></iconify-icon>
              <span>Connect USB</span>
            </button>
            <button
              type="button"
              onClick={() => setUseLaptopMicFallback((prev) => !prev)}
              className="px-2.5 py-1 rounded-xl bg-amber-200/80 hover:bg-amber-200 text-amber-900 text-xs font-semibold transition-colors cursor-pointer"
            >
              {useLaptopMicFallback ? 'Disable Laptop Mic' : 'Use Laptop Mic'}
            </button>
          </div>
        </div>
      )}

      {/* Spoken Announcement Transcript Box */}
      <div className="bg-cream rounded-2xl p-5 border border-ink/8 mb-6 text-left">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-inkmute flex items-center gap-1.5">
            <iconify-icon icon="ph:chats-bold" width="13" height="13"></iconify-icon>
            <span>Voice Announcement / ଡାକ୍ତରୀ ନିର୍ଦ୍ଦେଶ</span>
          </span>
          <button
            type="button"
            onClick={playAnnouncement}
            className="text-xs font-semibold text-magenta hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <iconify-icon icon="ph:arrow-clockwise-bold" width="12" height="12"></iconify-icon>
            <span>Replay Announcement / ଆଉଥରେ ଶୁଣନ୍ତୁ</span>
          </button>
        </div>
        <p className="font-serif text-lg sm:text-xl text-ink leading-relaxed font-medium">
          "{announcementData.text}"
        </p>
      </div>

      {/* Live speech feedback if spoken via hardware mic */}
      {liveTranscript && (
        <div className="mb-6 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-center gap-2">
          <iconify-icon icon="ph:waveform-bold" width="16" height="16" className="text-emerald-600 animate-pulse"></iconify-icon>
          <span>
            <strong>Hardware Mic Detected:</strong> "{liveTranscript}"
          </span>
        </div>
      )}

      {showQuickName && (
        <div className="w-full max-w-xl mx-auto mb-5 rounded-2xl border border-magenta/30 bg-magenta/5 p-4 text-left">
          <label htmlFor="quick-name" className="block text-xs font-semibold text-ink mb-2">
            {activeLang === 'hi' ? 'अपना नाम लिखें' : 'Type your name'}
          </label>
          <div className="flex gap-2">
            <input
              id="quick-name"
              value={quickName}
              onChange={(event) => setQuickName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') continueWithQuickName();
              }}
              className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-cream px-3 py-2 text-sm text-ink outline-none focus:border-magenta"
              autoComplete="name"
            />
            <button
              type="button"
              onClick={continueWithQuickName}
              disabled={quickName.trim().length < 2}
              className="rounded-xl bg-magenta px-4 py-2 text-xs font-bold text-cream disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* The Two Main Interactive Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-4">
        {/* Option 1: Talking (Voice Mode) */}
        <button
          type="button"
          onClick={() => proceedToVoice()}
          className="group relative flex flex-col items-center justify-between p-6 sm:p-7 rounded-2xl bg-cream border-2 border-magenta hover:bg-magenta/5 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 text-center cursor-pointer"
        >
          <div className="w-14 h-14 rounded-full bg-magenta/10 text-magenta flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <iconify-icon icon="ph:microphone-stage-bold" width="28" height="28"></iconify-icon>
          </div>

          <div>
            <span className="block font-serif text-2xl font-bold text-ink mb-1 group-hover:text-magenta">
              {activeLang === 'or' ? '୧. କଥା କହିବା (Talking)' :
                activeLang === 'hi' ? '1. बोलकर (Talking)' :
                  '1. Continue Talking'}
            </span>
            <p className="text-xs text-inkmute leading-relaxed mb-4">
              {activeLang === 'or' ? 'ESP32 ହାର୍ଡୱେର୍ ମାଇକ୍‌ରେ ନିଜ ନାମ କୁହନ୍ତୁ କିମ୍ବା ଏଠାରେ କ୍ଲିକ୍ କରି ଭଏସ୍ କନସଲଟେସନ୍ ଆରମ୍ଭ କରନ୍ତୁ।' :
                activeLang === 'hi' ? 'ESP32 हार्डवेयर माइक में अपना नाम बोलें या यहाँ क्लिक करके वॉयस कंसल्टेशन शुरू करें।' :
                  'Speak your name into the ESP32 hardware mic, or click here to begin conversational intake.'}
            </p>
          </div>

          <div className="w-full py-2.5 px-4 rounded-xl bg-magenta text-cream text-xs font-bold shadow-sm group-hover:shadow transition-all">
            Start Voice Mode →
          </div>
        </button>

        {/* Option 2: Typing (Manual Form) */}
        <button
          type="button"
          onClick={proceedToTyping}
          className="group relative flex flex-col items-center justify-between p-6 sm:p-7 rounded-2xl bg-cream border-2 border-ink/15 hover:border-ink hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 text-center cursor-pointer"
        >
          <div className="w-14 h-14 rounded-full bg-ink/10 text-ink flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <iconify-icon icon="ph:pencil-simple-line-bold" width="28" height="28"></iconify-icon>
          </div>

          <div>
            <span className="block font-serif text-2xl font-bold text-ink mb-1 group-hover:text-ink">
              {activeLang === 'or' ? '୨. ଲେଖିକରି (Typing)' :
                activeLang === 'hi' ? '2. लिखकर (Typing)' :
                  '2. Continue Typing'}
            </span>
            <p className="text-xs text-inkmute leading-relaxed mb-4">
              {activeLang === 'or' ? 'ହାର୍ଡୱେର୍ ମାଇକ୍‌ରେ "Typing" କୁହନ୍ତୁ କିମ୍ବା ସମସ୍ତ ତଥ୍ୟ ସ୍ୱୟଂ ଲେଖି ଫର୍ମ ପୂରଣ କରିବାକୁ ଏଠାରେ କ୍ଲିକ୍ କରନ୍ତୁ।' :
                activeLang === 'hi' ? 'हार्डवेयर माइक में "टाइपिंग" बोलें या सभी विवरण स्वयं लिखकर फॉर्म भरने के लिए यहाँ क्लिक करें।' :
                  'Say "typing" into the hardware mic or click here to fill out the manual intake form.'}
            </p>
          </div>

          <div className="w-full py-2.5 px-4 rounded-xl bg-ink text-cream text-xs font-bold shadow-sm group-hover:bg-ink/90 transition-all">
            Open Written Form →
          </div>
        </button>
      </div>

      {/* Hardware Isolation Notice */}
      <div className="mt-6 pt-4 border-t border-ink/10 flex items-center justify-center gap-2 text-[11px] text-inkmute">
        <iconify-icon icon="ph:shield-check-bold" width="14" height="14" className="text-emerald-600"></iconify-icon>
        <span>
          Hardware Security: Strict ESP32-S3 INMP441 audio isolation active. Browser/laptop audio streams are disabled.
        </span>
      </div>
    </div>
  </div>
);
};
