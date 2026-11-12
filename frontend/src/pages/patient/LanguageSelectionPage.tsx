import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/useLanguage';
import { stopGlobalAudio } from '../../services/globalAudio';
import type { SupportedLanguage } from '../../i18n/translations';

export interface IndianLanguageItem {
  code: string;
  mappedCode: SupportedLanguage;
  name: string;
  native: string;
  script: string;
  region: string;
  tagline: string;
  category: 'Popular' | 'East & North-East' | 'North' | 'South' | 'West' | 'Classical & Regional';
}

const ALL_INDIAN_LANGUAGES: IndianLanguageItem[] = [
  // ── Popular Core ──
  {
    code: 'or',
    mappedCode: 'or',
    name: 'Odia',
    native: 'ଓଡ଼ିଆ',
    script: 'Odia',
    region: 'Odisha (ଓଡ଼ିଶା)',
    tagline: 'ଓଡ଼ିଆରେ କଥା କୁହନ୍ତୁ କିମ୍ବା ଲେଖନ୍ତୁ',
    category: 'Popular',
  },
  {
    code: 'hi',
    mappedCode: 'hi',
    name: 'Hindi',
    native: 'हिन्दी',
    script: 'Devanagari',
    region: 'North & Central India',
    tagline: 'हिन्दी में बोलें या लिखकर जारी रखें',
    category: 'Popular',
  },
  {
    code: 'en',
    mappedCode: 'en',
    name: 'English',
    native: 'English',
    script: 'Latin',
    region: 'All India / National',
    tagline: 'Continue in English by speaking or typing',
    category: 'Popular',
  },
  {
    code: 'bn',
    mappedCode: 'bn',
    name: 'Bengali',
    native: 'বাংলা',
    script: 'Bengali',
    region: 'West Bengal & Tripura',
    tagline: 'বাংলায় কথা বলুন বা লিখে জানান',
    category: 'Popular',
  },
  {
    code: 'te',
    mappedCode: 'te',
    name: 'Telugu',
    native: 'తెలుగు',
    script: 'Telugu',
    region: 'Andhra Pradesh & Telangana',
    tagline: 'తెలుగులో మాట్లాడండి లేదా రాయండి',
    category: 'Popular',
  },
  {
    code: 'ta',
    mappedCode: 'ta',
    name: 'Tamil',
    native: 'தமிழ்',
    script: 'Tamil',
    region: 'Tamil Nadu & Puducherry',
    tagline: 'தமிழில் பேசுங்கள் அல்லது எழுதுங்கள்',
    category: 'Popular',
  },
  {
    code: 'mr',
    mappedCode: 'mr',
    name: 'Marathi',
    native: 'मराठी',
    script: 'Devanagari',
    region: 'Maharashtra & Goa',
    tagline: 'मराठीत बोला किंवा लिहून माहिती द्या',
    category: 'Popular',
  },
  {
    code: 'gu',
    mappedCode: 'gu',
    name: 'Gujarati',
    native: 'ગુજરાતી',
    script: 'Gujarati',
    region: 'Gujarat',
    tagline: 'ગુજરાતીમાં બોલો અથવા લખો',
    category: 'Popular',
  },
  {
    code: 'kn',
    mappedCode: 'kn',
    name: 'Kannada',
    native: 'ಕನ್ನಡ',
    script: 'Kannada',
    region: 'Karnataka',
    tagline: 'ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡಿ ಅಥವಾ ಬರೆಯಿರಿ',
    category: 'Popular',
  },
  {
    code: 'ml',
    mappedCode: 'ml',
    name: 'Malayalam',
    native: 'മലയാളം',
    script: 'Malayalam',
    region: 'Kerala & Lakshadweep',
    tagline: 'മലയാളത്തിൽ സംസാരിക്കുക അല്ലെങ്കിൽ എഴുതുക',
    category: 'Popular',
  },
  {
    code: 'pa',
    mappedCode: 'pa',
    name: 'Punjabi',
    native: 'ਪੰਜਾਬੀ',
    script: 'Gurmukhi',
    region: 'Punjab & Chandigarh',
    tagline: 'ਪੰਜਾਬੀ ਵਿੱਚ ਬੋਲੋ ਜਾਂ ਲਿਖ ਕੇ ਦੱਸੋ',
    category: 'Popular',
  },

  // ── East & North-East ──
  {
    code: 'as',
    mappedCode: 'as',
    name: 'Assamese',
    native: 'অসমীয়া',
    script: 'Bengali-Assamese',
    region: 'Assam',
    tagline: 'অসমীয়াত কথা পাতক বা লিখক',
    category: 'East & North-East',
  },
  {
    code: 'mai',
    mappedCode: 'mai',
    name: 'Maithili',
    native: 'मैथिली',
    script: 'Devanagari',
    region: 'Bihar & Jharkhand',
    tagline: 'मैथिली मे बात करू या लिखू',
    category: 'East & North-East',
  },
  {
    code: 'sat',
    mappedCode: 'sat',
    name: 'Santali',
    native: 'ᱥᱟᱱᱛᱟᱲᱤ',
    script: 'Ol Chiki',
    region: 'Odisha, Jharkhand, WB',
    tagline: 'ᱥᱟᱱᱛᱟᱲᱤ ᱛᱮ ᱨᱚᱲ ᱢᱮ',
    category: 'East & North-East',
  },
  {
    code: 'mni',
    mappedCode: 'mni',
    name: 'Manipuri (Meitei)',
    native: 'মৈতৈলোନ୍',
    script: 'Meetei Mayek / Bengali',
    region: 'Manipur',
    tagline: 'মৈতৈলোন্দা ৱা ঙাংবীয়ু',
    category: 'East & North-East',
  },
  {
    code: 'brx',
    mappedCode: 'brx',
    name: 'Bodo',
    native: 'बड़ो',
    script: 'Devanagari',
    region: 'Bodoland, Assam',
    tagline: 'बड़ो रावजों रायज्लाय',
    category: 'East & North-East',
  },

  // ── North & West ──
  {
    code: 'ur',
    mappedCode: 'ur',
    name: 'Urdu',
    native: 'اردو',
    script: 'Nastaliq',
    region: 'National / Telangana, UP, J&K',
    tagline: 'اردو میں بات کریں یا لکھیں',
    category: 'North',
  },
  {
    code: 'ks',
    mappedCode: 'ks',
    name: 'Kashmiri',
    native: 'کٲشُر / कॉशुर',
    script: 'Perso-Arabic / Devanagari',
    region: 'Jammu & Kashmir',
    tagline: 'کٲشُر مَنٛز کٔرِو کتھ',
    category: 'North',
  },
  {
    code: 'doi',
    mappedCode: 'doi',
    name: 'Dogri',
    native: 'डोगरी',
    script: 'Devanagari',
    region: 'Jammu & Himachal',
    tagline: 'डोगरी च गल्ल करो',
    category: 'North',
  },
  {
    code: 'ne',
    mappedCode: 'ne',
    name: 'Nepali',
    native: 'नेपाली',
    script: 'Devanagari',
    region: 'Sikkim & West Bengal',
    tagline: 'नेपालीमा कुरा गर्नुहोस् वा लेख्नुहोस्',
    category: 'North',
  },
  {
    code: 'kok',
    mappedCode: 'kok',
    name: 'Konkani',
    native: 'कोंकणी',
    script: 'Devanagari',
    region: 'Goa & Coastal Karnataka',
    tagline: 'कोंकणींत उलययात वा बरयात',
    category: 'West',
  },
  {
    code: 'sd',
    mappedCode: 'sd',
    name: 'Sindhi',
    native: 'سنڌي / सिन्धी',
    script: 'Arabic / Devanagari',
    region: 'Gujarat, Maharashtra, Rajasthan',
    tagline: 'سنڌيءَ ۾ ڳالھايو',
    category: 'West',
  },

  // ── Classical ──
  {
    code: 'sa',
    mappedCode: 'sa',
    name: 'Sanskrit',
    native: 'संस्कृतम्',
    script: 'Devanagari',
    region: 'Pan-India',
    tagline: 'संस्कृतेन सम्भाषणं कुर्वन्तु',
    category: 'Classical & Regional',
  },
];

export const LanguageSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const { setLanguage } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', 'Popular', 'East & North-East', 'North', 'South', 'West', 'Classical & Regional'];

  const filteredLanguages = useMemo(() => {
    return ALL_INDIAN_LANGUAGES.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.native.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.script.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [searchQuery, selectedCategory]);

  const handleSelectLanguage = (item: IndianLanguageItem) => {
    // Immediately stop any active audio, sound synthesis, or background speech
    stopGlobalAudio();

    setLanguage(item.code as SupportedLanguage);
    try {
      localStorage.setItem('jansaathi_lang', item.code);
      localStorage.setItem('jansaathi_specific_lang', item.code);
      localStorage.setItem('jansaathi_lang_name', item.name);
      localStorage.setItem('jansaathi_lang_native', item.native);
    } catch {}

    navigate(`/patient/mode?lang=${item.code}`);
  };

  return (
    <div className="min-h-[85vh] flex flex-col justify-start items-center py-8 px-4 sm:px-6">
      {/* Top Navigation Row */}
      <div className="w-full max-w-5xl mb-6 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-inkmute hover:text-ink transition-colors px-3.5 py-1.5 rounded-full bg-ink/5 hover:bg-ink/10"
        >
          <iconify-icon icon="ph:arrow-left-bold" width="14" height="14"></iconify-icon>
          <span>Back to Home / ମୁଖ୍ୟ ପୃଷ୍ଠା</span>
        </Link>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-ink/5 border border-ink/10 text-inkmute text-xs font-semibold">
          <iconify-icon icon="ph:translate-bold" width="14" height="14"></iconify-icon>
          <span>Step 1: Choose Language / ଭାଷା ଚୟନ କରନ୍ତୁ</span>
        </div>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-5xl bg-creamdeep/40 rounded-3xl p-6 sm:p-10 border border-ink/10 shadow-sm text-center">
        {/* Eyebrow badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-magenta/10 border border-magenta/20 text-magenta text-xs font-bold uppercase tracking-wider mb-4">
          <iconify-icon icon="ph:translate-bold" width="15" height="15"></iconify-icon>
          <span>All 22+ Indian Languages Supported • ସମସ୍ତ ଭାରତୀୟ ଭାଷା</span>
        </div>

        {/* Headlines */}
        <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-semibold text-ink tracking-tight mb-2">
          ଆପଣ କେଉଁ ଭାଷାରେ ଆଗକୁ ବଢ଼ିବାକୁ ଚାହାଁନ୍ତି?
        </h1>
        <p className="text-base sm:text-lg text-inkmute font-medium mb-1">
          आप किस भारतीय भाषा में आगे बढ़ना चाहते हैं?
        </p>
        <p className="text-xs sm:text-sm text-inkmute/80 font-normal mb-8">
          Select your preferred mother tongue for intake through the ESP32 hardware device microphone
        </p>

        {/* Search & Category Filter Bar */}
        <div className="w-full max-w-2xl mx-auto mb-8 space-y-3">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-inkmute">
              <iconify-icon icon="ph:magnifying-glass-bold" width="18" height="18"></iconify-icon>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by language (e.g., Odia, हिन्दी, বাংলা, தமிழ், Telugu, Marathi)..."
              className="w-full pl-12 pr-4 py-3 rounded-2xl bg-cream border border-ink/15 text-sm font-medium focus:outline-none focus:border-magenta focus:ring-2 focus:ring-magenta/10 transition-all placeholder:text-inkmute/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-inkmute hover:text-ink text-xs font-bold"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  selectedCategory === cat
                    ? 'bg-ink text-cream shadow-xs'
                    : 'bg-cream text-inkmute hover:text-ink border border-ink/10'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Language Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
          {filteredLanguages.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => handleSelectLanguage(item)}
              className="group relative flex flex-col justify-between p-5 rounded-2xl bg-cream border-2 border-ink/10 hover:border-magenta hover:shadow-lg transition-all duration-200 transform hover:-translate-y-0.5 cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-inkmute bg-ink/5 px-2 py-0.5 rounded-md">
                    {item.region}
                  </span>
                  <span className="w-6 h-6 rounded-full bg-creamdeep flex items-center justify-center text-inkmute group-hover:bg-magenta group-hover:text-cream transition-colors text-xs">
                    <iconify-icon icon="ph:arrow-right-bold" width="12" height="12"></iconify-icon>
                  </span>
                </div>

                <div className="mb-2">
                  <span className="block font-serif text-3xl font-bold text-ink group-hover:text-magenta transition-colors">
                    {item.native}
                  </span>
                  <span className="text-xs font-bold text-inkmute">
                    {item.name}
                  </span>
                </div>

                <p className="text-xs text-inkmute/90 leading-snug line-clamp-2">
                  {item.tagline}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-ink/6 flex items-center justify-between text-[11px] font-semibold text-magenta">
                <span className="inline-flex items-center gap-1 text-inkmute/75 group-hover:text-magenta transition-colors">
                  <iconify-icon icon="ph:microphone-stage-bold" width="13" height="13"></iconify-icon>
                  <span>ESP32 Hardware Mic</span>
                </span>
                <span className="group-hover:translate-x-0.5 transition-transform">
                  Select →
                </span>
              </div>
            </button>
          ))}
        </div>

        {filteredLanguages.length === 0 && (
          <div className="py-12 text-center">
            <iconify-icon icon="ph:magnifying-glass-duotone" width="36" height="36" className="text-inkmute/40 mb-2"></iconify-icon>
            <p className="text-sm font-semibold text-ink">No languages match "{searchQuery}"</p>
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setSelectedCategory('All'); }}
              className="mt-2 text-xs font-bold text-magenta hover:underline"
            >
              Reset filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
