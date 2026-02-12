import { NextResponse } from 'next/server';

// ===== "ON THIS DAY IN MUSIC" — Curated Music History Facts =====
// Returns facts for the current date. Cached per day.

const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours
let cachedFacts: { facts: string[]; date: string } | null = null;

// Master database of music history — organized by month/day
// Format: "MMDD" => facts[]
const MUSIC_HISTORY: Record<string, string[]> = {
    // January
    "0101": [
        "🎵 1962 — The Beatles auditioned for Decca Records and were rejected. The label said guitar groups were on the way out.",
        "🏆 2000 — 'Smooth' by Santana ft. Rob Thomas was #1 for the 12th week, one of the longest runs in Billboard history.",
    ],
    "0108": [
        "🎂 1947 — David Bowie was born in Brixton, London. He'd go on to sell over 140 million albums worldwide.",
        "🎵 1966 — 'We Can Work It Out' by The Beatles hit #1 on the Billboard Hot 100.",
    ],
    "0115": [
        "🎤 2010 — Jay-Z, Bono, The Edge & Rihanna recorded 'Stranded (Haiti Mon Amour)' for earthquake relief.",
        "🎵 1994 — Snoop Dogg's 'Doggystyle' was the first debut album to enter Billboard 200 at #1.",
    ],
    // February
    "0201": [
        "🎵 2003 — The Space Shuttle Columbia disaster; radio stations played 'Rocket Man' and 'Space Oddity' in tribute.",
        "🎤 1994 — Notorious B.I.G.'s 'Ready to Die' sessions began at The Hit Factory in NYC.",
    ],
    "0209": [
        "🎤 1964 — The Beatles made their US TV debut on The Ed Sullivan Show, watched by 73 million people.",
        "🏆 2003 — Norah Jones swept the Grammys with 5 wins including Album of the Year for 'Come Away with Me'.",
    ],
    "0212": [
        "🎵 2012 — Whitney Houston passed away at 48. 'I Will Always Love You' re-entered charts worldwide.",
        "🎤 2017 — Adele swept the Grammys, winning 5 awards including Album of the Year for '25'.",
        "🎂 1980 — Christina Ricci was born. She'd later appear in music videos for Moby and Weezer.",
    ],
    "0214": [
        "💍 2000 — Carlos Santana won 8 Grammy Awards for 'Supernatural', tying Michael Jackson's record.",
        "🎵 1983 — Michael Jackson's 'Thriller' album hit #1, where it would stay for 37 weeks total.",
        "🎤 2016 — Kanye West released 'The Life of Pablo' exclusively on Tidal, crashing the service.",
    ],
    // March
    "0301": [
        "🎵 1994 — Justin Bieber was born in London, Ontario. He'd become the youngest solo male to debut at #1.",
        "🏆 1973 — Pink Floyd's 'The Dark Side of the Moon' was released, eventually spending 937 weeks on Billboard.",
    ],
    "0315": [
        "🎵 2019 — Nipsey Hussle's 'Victory Lap' was nominated for Best Rap Album at the Grammys.",
        "🎤 1985 — 'We Are the World' single was released, eventually selling 20 million copies.",
    ],
    // April
    "0401": [
        "🎵 2008 — Beyoncé and Jay-Z secretly married in a private ceremony in NYC.",
        "🎤 2004 — Apple launched iTunes in Europe, bringing the music store to 15 additional countries.",
    ],
    "0413": [
        "🎂 1950 — Ron Perlman was born. Also: Al Green was born in 1946 — 'Let's Stay Together' is eternal.",
        "🎵 2018 — Cardi B's 'Invasion of Privacy' debuted at #1 on Billboard 200.",
    ],
    // May
    "0501": [
        "🎵 2016 — Beyoncé's 'Lemonade' sold 653,000 copies in its first week. Cultural earthquake.",
        "🎤 1994 — Nas released 'Illmatic', now considered one of the greatest hip-hop albums ever.",
    ],
    "0525": [
        "🎂 1963 — Mike Myers was born. His 'Wayne's World' made 'Bohemian Rhapsody' a #1 hit — 16 years after release.",
        "🎵 2004 — Green Day began recording 'American Idiot', which would become a Broadway musical.",
    ],
    // June
    "0601": [
        "🎵 1967 — The Beatles released 'Sgt. Pepper's Lonely Hearts Club Band', redefining what an album could be.",
        "🏆 2019 — Lil Nas X's 'Old Town Road' was on week 6 of 19 at #1 on the Hot 100.",
    ],
    "0625": [
        "🎤 2009 — Michael Jackson passed away at 50. His music generated $900M+ in the year after his death.",
        "🎵 1993 — Wu-Tang Clan released 'Enter the Wu-Tang (36 Chambers)'. Changed hip-hop forever.",
    ],
    // July
    "0704": [
        "🎵 2007 — Rihanna's 'Umbrella' was #1 globally on Independence Day — ella ella eh eh eh.",
        "🎤 2002 — Eminem's '8 Mile' began filming in Detroit, spawning the Oscar-winning 'Lose Yourself'.",
    ],
    "0713": [
        "🎵 1985 — Live Aid concerts in London and Philadelphia raised $127M. Freddie Mercury stole the show.",
        "🏆 2023 — Morgan Wallen's 'Last Night' spent its 12th week at #1 on the Hot 100.",
    ],
    // August
    "0801": [
        "🎵 1981 — MTV launched at 12:01am with 'Video Killed the Radio Star' by The Buggles.",
        "🎤 1971 — The Concert for Bangladesh, organized by George Harrison, became the first major charity concert.",
    ],
    "0816": [
        "🎂 1958 — Madonna was born in Bay City, Michigan. She'd sell over 300 million records globally.",
        "🎵 1977 — Elvis Presley passed away at Graceland. His recordings have sold over 1 billion units worldwide.",
    ],
    // September
    "0901": [
        "🎵 2017 — 'Despacito' by Luis Fonsi was still #1 — eventually becoming the most-streamed song on Spotify at the time.",
        "🎤 2009 — Jay-Z released 'The Blueprint 3', debuting at #1 with 476,000 first-week sales.",
    ],
    "0913": [
        "🎵 1996 — Tupac Shakur passed away at 25. He'd posthumously release 7 more studio albums.",
        "🏆 2006 — Justin Timberlake released 'FutureSex/LoveSounds', launching a new era of pop/R&B.",
    ],
    // October
    "1001": [
        "🎵 2020 — BTS's 'Dynamite' was still dominating charts globally, becoming the first Korean act to debut at #1 on Hot 100.",
        "🎤 1988 — Tracy Chapman performed at the Nelson Mandela 70th Birthday concert, launching her career overnight.",
    ],
    "1031": [
        "🎵 1982 — Michael Jackson's 'Thriller' was released. It would become the best-selling album of all time.",
        "🎤 2015 — Adele's 'Hello' broke the record for most YouTube views in 24 hours with 27.7 million.",
    ],
    // November
    "1101": [
        "🎵 2015 — Drake's 'Hotline Bling' video went viral, spawning thousands of memes and parodies.",
        "🎤 2005 — Kanye West appeared on NBC's Hurricane Katrina telethon and said 'George Bush doesn't care about Black people.'",
    ],
    "1125": [
        "🎵 2016 — 'Bad and Boujee' by Migos started its climb to #1 — it would get there by January.",
        "🏆 1991 — Freddie Mercury passed away. 'Bohemian Rhapsody' re-entered the UK charts at #1.",
    ],
    // December
    "1201": [
        "🎵 1982 — Michael Jackson's 'Thriller' was released in the US. It would eventually sell 70 million copies.",
        "🎤 2016 — Childish Gambino released 'Awaken, My Love!', surprising fans with a funk/soul direction.",
    ],
    "1225": [
        "🎵 1994 — 'All I Want for Christmas Is You' by Mariah Carey was released. It'd eventually hit #1 in 2019, 25 years later.",
        "🎤 2021 — Spotify Wrapped revealed Bad Bunny as the most-streamed artist globally for the 2nd year in a row.",
    ],
};

// Universal fallback facts that work year-round
const UNIVERSAL_FACTS = [
    "🎵 Vinyl sales have increased 1,600% since 2006 — crate digging is more alive than ever.",
    "🏆 The Grammy for Best Dance Recording has existed since 1998. First winner: Daft Punk's 'Da Funk'.",
    "🎤 The longest-running #1 hit in Billboard history is 'Old Town Road' by Lil Nas X — 19 weeks.",
    "📀 Michael Jackson's 'Thriller' remains the best-selling album ever with 70 million copies sold.",
    "🎵 Spotify reached 100 million paid subscribers in 2019 — now it's over 250 million.",
    "🎤 The most-sampled song in hip-hop history is 'Amen, Brother' by The Winstons — for its drum break.",
    "🏆 Beyoncé holds the record for most Grammy wins ever by any artist — 32 and counting.",
    "🎵 The 808 drum machine was discontinued by Roland in 1983 — then hip-hop made it immortal.",
    "📀 Drake is the first artist to reach 50 billion streams on Spotify.",
    "🎤 'Bohemian Rhapsody' was considered too long for radio at 5:55 — Queen released it anyway.",
    "🎵 The first DJ to play two records simultaneously was Francis Grasso at The Sanctuary, NYC, in 1969.",
    "🏆 Frankie Knuckles, 'The Godfather of House Music', got Chicago's South Jefferson Street renamed in his honor.",
    "🎤 Grandmaster Flash's 'The Adventures of Grandmaster Flash on the Wheels of Steel' (1981) was the first DJ mix single.",
    "📀 The Technics SL-1200 turntable was first released in 1972 — still the industry standard for DJs.",
    "🎵 The term 'DJ' was first used in a 1935 radio commentary — it originally meant 'disc jockey' for radio hosts.",
    "🎤 Larry Levan's legendary Paradise Garage parties ran from 1977-1987 and birthed garage house music.",
    "🏆 The first vinyl record was made by Emile Berliner in 1887 — nearly 140 years ago.",
    "🎵 CDJs were introduced by Pioneer in 1994 — the CDJ-500. Now the CDJ-3000 runs the world.",
    "🎤 Avicii's 'Levels' was rejected by multiple labels before becoming one of the biggest EDM tracks ever.",
    "📀 The BPM for most pop hits has decreased from ~120 in 2010 to ~100 in 2024 — slower tempos are in.",
];

function getTodayKey(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${month}${day}`;
}

function getFactsForToday(): string[] {
    const key = getTodayKey();
    const todayFacts = MUSIC_HISTORY[key] || [];

    // Always combine with a random selection of universal facts
    const shuffledUniversal = [...UNIVERSAL_FACTS].sort(() => Math.random() - 0.5);
    const universalSlice = shuffledUniversal.slice(0, 5);

    return todayFacts.length > 0
        ? [...todayFacts, ...universalSlice]
        : universalSlice;
}

export async function GET() {
    const today = getTodayKey();

    // Return cached if same day
    if (cachedFacts && cachedFacts.date === today) {
        return NextResponse.json({ facts: cachedFacts.facts, cached: true, date: today });
    }

    const facts = getFactsForToday();

    cachedFacts = { facts, date: today };

    return NextResponse.json({
        facts,
        cached: false,
        date: today,
        count: facts.length,
    });
}
