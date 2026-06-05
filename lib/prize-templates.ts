export type PrizeTemplateId = 'golden_hour_hat' | 'free_necklace' | 'nice_crate_shirt';
export type PrizeRevealMode = 'instant' | 'spin' | 'final_three';

export interface PrizeTemplate {
    id: PrizeTemplateId;
    title: string;
    prizeName: string;
    description: string;
    icon: string;
    imageUrl: string;
    claimUrl: string;
    promoCode: string;
    winnerSubtitle: string;
    viewerMessage: string;
    claimInstructions: string;
}

export const PRIZE_TEMPLATES: PrizeTemplate[] = [
    {
        id: 'golden_hour_hat',
        title: 'Golden Hour Drop',
        prizeName: 'Free Hat',
        description: 'The classic Crate Hackers merch prize.',
        icon: '🎰',
        imageUrl: '/hat-prize.png',
        claimUrl: 'https://dj.style/products/crate-hackers-vintage-cotton-twill-hat-special-offer',
        promoCode: 'HACKATHONWINNER',
        winnerSubtitle: "You've been selected — free hat incoming!",
        viewerMessage: 'just won a free hat',
        claimInstructions: 'Tap above, add the prize to cart, then enter promo code HACKATHONWINNER at checkout to redeem.',
    },
    {
        id: 'free_necklace',
        title: 'Necklace Drop',
        prizeName: 'Free Necklace',
        description: 'A DJ-style necklace prize for the live room.',
        icon: '🎧',
        imageUrl: '/necklace-prize.png',
        claimUrl: 'https://dj.style/discount/FREEAUXNECKLACE?redirect=%2Fproducts%2Fgunmetal-dj-necklace-with-functioning-1-4-aux-adapter',
        promoCode: 'FREEAUXNECKLACE',
        winnerSubtitle: 'You scored the free necklace drop.',
        viewerMessage: 'just won a free necklace',
        claimInstructions: 'Tap above, add the necklace to cart, and the code should apply automatically. If checkout asks, use FREEAUXNECKLACE.',
    },
    {
        id: 'nice_crate_shirt',
        title: 'Nice Crate Shirt Drop',
        prizeName: 'Have a Nice Crate T-Shirt',
        description: 'A free Have a Nice Crate tee for the winner.',
        icon: '👕',
        imageUrl: '/nice-crate-shirt-prize.png',
        claimUrl: 'https://dj.style/discount/HAVEANICECR8?redirect=%2Fproducts%2Fhave-a-nice-crate-unisex-t-shirt',
        promoCode: 'HAVEANICECR8',
        winnerSubtitle: 'You won the Have a Nice Crate tee.',
        viewerMessage: 'just won a Have a Nice Crate t-shirt',
        claimInstructions: 'Tap above, add the shirt to cart, and the code should apply automatically. If checkout asks, use HAVEANICECR8.',
    },
];

export const PRIZE_REVEAL_MODES: { id: PrizeRevealMode; label: string; description: string }[] = [
    { id: 'instant', label: 'Instant Drop', description: 'Fast winner reveal for quick moments.' },
    { id: 'spin', label: 'Spin The Crate', description: 'Cycles through finalists before the reveal.' },
    { id: 'final_three', label: 'Final Three Reveal', description: 'Shows three finalists, then lands on the winner.' },
];

export function getPrizeTemplate(templateId?: string | null): PrizeTemplate {
    return PRIZE_TEMPLATES.find(template => template.id === templateId) || PRIZE_TEMPLATES[0];
}

export function isPrizeRevealMode(value: unknown): value is PrizeRevealMode {
    return value === 'instant' || value === 'spin' || value === 'final_three';
}
