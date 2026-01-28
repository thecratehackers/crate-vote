// Geolocation utility for tracking user locations

export interface UserLocation {
    city: string | null;
    region: string | null;  // state/province
    country: string | null;
    countryCode: string | null;
    lat: number | null;
    lon: number | null;
    displayLocation: string; // formatted display string
}

// Get location display string (e.g., "Austin, TX" or "London, UK")
export function formatLocation(location: UserLocation | null): string {
    if (!location) return '';
    
    if (location.displayLocation) return location.displayLocation;
    
    if (location.city && location.region) {
        // US-style: City, State abbreviation
        if (location.countryCode === 'US') {
            return `${location.city}, ${location.region}`;
        }
        // International: City, Country
        return `${location.city}, ${location.countryCode || location.country || ''}`;
    }
    
    if (location.city) return location.city;
    if (location.region) return location.region;
    if (location.country) return location.country;
    
    return '';
}

// State abbreviation map for US states
const US_STATE_ABBREV: Record<string, string> = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
    'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
    'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
    'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
    'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
    'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
    'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
    'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
    'District of Columbia': 'DC'
};

// Get state abbreviation
export function getStateAbbrev(stateName: string): string {
    return US_STATE_ABBREV[stateName] || stateName;
}

// Create a display-ready location from IP lookup response
export function createDisplayLocation(ipData: {
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
    lat?: number;
    lon?: number;
}): UserLocation {
    const city = ipData.city || null;
    const region = ipData.region || null;
    const country = ipData.country || null;
    const countryCode = ipData.countryCode || null;
    
    let displayLocation = '';
    
    if (city && region) {
        if (countryCode === 'US') {
            // US: "Austin, TX"
            displayLocation = `${city}, ${getStateAbbrev(region)}`;
        } else {
            // International: "London, UK"
            displayLocation = `${city}, ${countryCode || country || ''}`;
        }
    } else if (city) {
        displayLocation = city;
    } else if (region) {
        displayLocation = region;
    } else if (country) {
        displayLocation = country;
    }
    
    return {
        city,
        region,
        country,
        countryCode,
        lat: ipData.lat || null,
        lon: ipData.lon || null,
        displayLocation,
    };
}

// Country flag emoji from country code
export function getCountryFlag(countryCode: string | null): string {
    if (!countryCode || countryCode.length !== 2) return '🌍';
    
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    
    return String.fromCodePoint(...codePoints);
}

// Get a compact location badge for display
export function getLocationBadge(location: UserLocation | null): string {
    if (!location) return '';
    
    const flag = getCountryFlag(location.countryCode);
    const text = formatLocation(location);
    
    if (text) {
        return `${flag} ${text}`;
    }
    
    return flag;
}
