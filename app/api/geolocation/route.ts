import { NextResponse } from 'next/server';

// IP-based geolocation using free ip-api.com service
// Returns location data for the requesting user

export async function GET(request: Request) {
    try {
        // Get client IP from headers (Vercel/Cloudflare pass this)
        const forwarded = request.headers.get('x-forwarded-for');
        const realIp = request.headers.get('x-real-ip');
        const cfConnectingIp = request.headers.get('cf-connecting-ip');

        // Use the first available IP, default to empty for local testing
        const clientIp = cfConnectingIp || realIp || (forwarded ? forwarded.split(',')[0].trim() : '');

        // For local development/testing
        if (!clientIp || clientIp === '127.0.0.1' || clientIp === '::1') {
            // Return mock local data
            return NextResponse.json({
                success: true,
                location: {
                    city: 'Local',
                    region: null,
                    country: 'Development',
                    countryCode: null,
                    lat: null,
                    lon: null,
                    displayLocation: '🏠 Local',
                },
            });
        }

        // Call ip-api.com for geolocation (free tier: 45 req/min)
        // Documentation: http://ip-api.com/docs/api:json
        const geoResponse = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,country,countryCode,region,regionName,city,lat,lon`);

        if (!geoResponse.ok) {
            console.error(`Geolocation API error: ${geoResponse.status}`);
            return NextResponse.json({
                success: false,
                error: 'Could not determine location',
            });
        }

        const geoData = await geoResponse.json();

        if (geoData.status !== 'success') {
            console.error('Geolocation lookup failed:', geoData);
            return NextResponse.json({
                success: false,
                error: 'Location lookup failed',
            });
        }

        // Build display location string
        let displayLocation = '';

        if (geoData.city && geoData.regionName) {
            if (geoData.countryCode === 'US') {
                // For US: "Austin, TX"
                displayLocation = `${geoData.city}, ${geoData.region}`;
            } else {
                // International: "London, UK"
                displayLocation = `${geoData.city}, ${geoData.countryCode}`;
            }
        } else if (geoData.city) {
            displayLocation = geoData.city;
        } else if (geoData.regionName) {
            displayLocation = geoData.regionName;
        } else if (geoData.country) {
            displayLocation = geoData.country;
        }

        return NextResponse.json({
            success: true,
            location: {
                city: geoData.city || null,
                region: geoData.region || geoData.regionName || null,
                country: geoData.country || null,
                countryCode: geoData.countryCode || null,
                lat: geoData.lat || null,
                lon: geoData.lon || null,
                displayLocation,
            },
        });

    } catch (error) {
        console.error('Geolocation error:', error);
        return NextResponse.json({
            success: false,
            error: 'Could not determine location',
        });
    }
}
