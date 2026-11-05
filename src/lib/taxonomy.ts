// Static taxonomy — 13 L1 departments, 265 nodes, 4 levels deep.
// Hardcoded, no database calls. Client-side rendered.

export interface TaxonomyNode {
  name: string;
  slug: string;
  count: number;
  children: TaxonomyNode[];
}

export const taxonomy: TaxonomyNode[] = [
  {
    name: "Accessories",
    slug: "accessories",
    count: 203,
    children: [
      { name: "Accessories for Kids & Babies", slug: "accessories-for-kids-and-babies", count: 0, children: [] },
      { name: "All accessories", slug: "all-accessories", count: 1, children: [] },
      {
        name: "Bags",
        slug: "bags",
        count: 121,
        children: [
          { name: "Backpacks", slug: "backpacks", count: 4, children: [] },
          { name: "Drawstring bags", slug: "drawstring-bags", count: 1, children: [] },
          { name: "Duffle bags", slug: "duffle-bags", count: 1, children: [] },
          { name: "Fanny packs", slug: "fanny-packs", count: 3, children: [] },
          { name: "Handbags", slug: "handbags", count: 1, children: [] },
          { name: "Tote bags", slug: "tote-bags", count: 10, children: [] },
        ],
      },
      { name: "Face masks", slug: "face-masks", count: 1, children: [] },
      {
        name: "Footwear",
        slug: "footwear",
        count: 19,
        children: [
          { name: "Flip flops", slug: "flip-flops", count: 2, children: [] },
          { name: "Shoes", slug: "shoes", count: 10, children: [] },
          { name: "Socks", slug: "socks", count: 7, children: [] },
        ],
      },
      { name: "Hair accessories", slug: "hair-accessories", count: 3, children: [] },
      { name: "Patches", slug: "patches", count: 1, children: [] },
      {
        name: "Pet",
        slug: "pet",
        count: 13,
        children: [
          { name: "ID tags", slug: "id-tags", count: 0, children: [] },
          { name: "Pet products", slug: "pet-products", count: 8, children: [] },
          { name: "Pets", slug: "pets", count: 0, children: [] },
        ],
      },
      { name: "Pins", slug: "pins", count: 1, children: [] },
      { name: "Sports accessories", slug: "sports-accessories", count: 2, children: [] },
    ],
  },
  {
    name: "Apparel",
    slug: "apparel",
    count: 9199,
    children: [
      {
        name: "Apparel for Babies",
        slug: "apparel-for-babies",
        count: 23,
        children: [
          { name: "Baby Beanies & Hats", slug: "baby-beanies-and-hats", count: 8, children: [] },
          { name: "Bibs & Feeding", slug: "bibs-and-feeding", count: 4, children: [] },
          { name: "Bodysuits & One Pieces", slug: "bodysuits-and-one-pieces", count: 7, children: [] },
          { name: "Dresses, Blankets & Toddler", slug: "dresses-blankets-and-toddler", count: 4, children: [] },
        ],
      },
      {
        name: "Bottoms",
        slug: "bottoms",
        count: 45,
        children: [
          { name: "Bottoms", slug: "bottoms", count: 45, children: [] },
        ],
      },
      {
        name: "Dresses",
        slug: "dresses",
        count: 8,
        children: [
          { name: "Dresses", slug: "dresses", count: 8, children: [] },
        ],
      },
      {
        name: "Hoodies & Sweatshirts",
        slug: "hoodies-and-sweatshirts",
        count: 121,
        children: [
          { name: "Hoodies", slug: "hoodies", count: 3659, children: [] },
          { name: "Pullover hoodies", slug: "pullover-hoodies", count: 0, children: [] },
          { name: "Sweatshirts", slug: "sweatshirts", count: 28, children: [] },
        ],
      },
      {
        name: "Kids",
        slug: "kids",
        count: 7852,
        children: [
          { name: "Bottoms", slug: "bottoms", count: 2, children: [] },
          { name: "Hoodies", slug: "hoodies", count: 2716, children: [] },
          { name: "Swimwear", slug: "swimwear", count: 2, children: [] },
          { name: "T-Shirts", slug: "t-shirts", count: 5126, children: [] },
          { name: "Tops", slug: "tops", count: 0, children: [] },
        ],
      },
      {
        name: "Men",
        slug: "men",
        count: 655,
        children: [
          { name: "Bottoms", slug: "bottoms", count: 2, children: [] },
          { name: "Hoodies", slug: "hoodies", count: 605, children: [] },
          { name: "Outerwear", slug: "outerwear", count: 3, children: [] },
          { name: "Swimwear", slug: "swimwear", count: 1, children: [] },
          { name: "T-Shirts", slug: "t-shirts", count: 44, children: [] },
        ],
      },
      {
        name: "Outerwear",
        slug: "outerwear",
        count: 22,
        children: [
          { name: "Outerwear", slug: "outerwear", count: 22, children: [] },
          { name: "Zip Jackets & Outwear", slug: "zip-jackets-and-outwear", count: 0, children: [] },
        ],
      },
      {
        name: "Swimwear",
        slug: "swimwear",
        count: 15,
        children: [
          { name: "Swimwear", slug: "swimwear", count: 15, children: [] },
        ],
      },
      {
        name: "T-Shirts & Polo Shirts",
        slug: "t-shirts-and-polo-shirts",
        count: 146,
        children: [
          { name: "T-Shirts", slug: "t-shirts", count: 5201, children: [] },
          {
            name: "Tops",
            slug: "tops",
            count: 5,
            children: [
              { name: "Graphic tees", slug: "graphic-tees", count: 0, children: [] },
              { name: "Premium Tees", slug: "premium-tees", count: 0, children: [] },
              { name: "Tops", slug: "tops", count: 5, children: [] },
            ],
          },
        ],
      },
      {
        name: "Women",
        slug: "women",
        count: 324,
        children: [
          { name: "Bottoms", slug: "bottoms", count: 3, children: [] },
          { name: "Dresses", slug: "dresses", count: 0, children: [] },
          { name: "Hoodies", slug: "hoodies", count: 287, children: [] },
          { name: "Outerwear", slug: "outerwear", count: 2, children: [] },
          { name: "Swimwear", slug: "swimwear", count: 0, children: [] },
          { name: "T-Shirts", slug: "t-shirts", count: 31, children: [] },
          { name: "Tops", slug: "tops", count: 1, children: [] },
        ],
      },
    ],
  },
  {
    name: "Business & commercial",
    slug: "business-and-commercial",
    count: 362,
    children: [
      { name: "Cards", slug: "cards", count: 175, children: [] },
      { name: "Notebooks", slug: "notebooks", count: 96, children: [] },
      { name: "Posters", slug: "posters", count: 81, children: [] },
      { name: "Print Products", slug: "print-products", count: 10, children: [] },
    ],
  },
  {
    name: "Cards & stationery",
    slug: "cards-and-stationery",
    count: 970,
    children: [
      {
        name: "Celebrations",
        slug: "celebrations",
        count: 876,
        children: [
          {
            name: "Gift Packaging",
            slug: "gift-packaging",
            count: 872,
            children: [
              { name: "Cards", slug: "cards", count: 863, children: [] },
              { name: "Gift insert sets", slug: "gift-insert-sets", count: 0, children: [] },
              { name: "Gift Wrap", slug: "gift-wrap", count: 0, children: [] },
              { name: "Message Inserts", slug: "message-inserts", count: 0, children: [] },
            ],
          },
        ],
      },
      {
        name: "Office & Desk",
        slug: "office-and-desk",
        count: 70,
        children: [
          {
            name: "Desk Gifts",
            slug: "desk-gifts",
            count: 70,
            children: [
              { name: "Calendars", slug: "calendars", count: 26, children: [] },
              { name: "Journals", slug: "journals", count: 0, children: [] },
              { name: "Notebooks", slug: "notebooks", count: 20, children: [] },
              { name: "Notecard sets", slug: "notecard-sets", count: 0, children: [] },
              { name: "Pens", slug: "pens", count: 0, children: [] },
            ],
          },
        ],
      },
      {
        name: "Stationery",
        slug: "stationery",
        count: 4,
        children: [
          { name: "Greeting cards", slug: "greeting-cards", count: 1, children: [] },
          { name: "Postcards", slug: "postcards", count: 1, children: [] },
        ],
      },
      {
        name: "Sticker & Magnets",
        slug: "sticker-and-magnets",
        count: 0,
        children: [
          { name: "Magnets", slug: "magnets", count: 2, children: [] },
          { name: "Stickers", slug: "stickers", count: 6, children: [] },
        ],
      },
    ],
  },
  {
    name: "Collections & Occasions",
    slug: "collections-and-occasions",
    count: 482,
    children: [
      {
        name: "Collections",
        slug: "collections",
        count: 265,
        children: [
          { name: "Back to school", slug: "back-to-school", count: 24, children: [] },
          { name: "Beachwear", slug: "beachwear", count: 24, children: [] },
          { name: "Gifts", slug: "gifts", count: 24, children: [] },
          { name: "Grow a fashion brand", slug: "grow-a-fashion-brand", count: 24, children: [] },
          { name: "Halloween", slug: "halloween", count: 24, children: [] },
          { name: "Holiday Season", slug: "holiday-season", count: 24, children: [] },
          { name: "Made in EU", slug: "made-in-eu", count: 24, children: [] },
          { name: "Matching Sets", slug: "matching-sets", count: 24, children: [] },
          { name: "New Apparel Variants", slug: "new-apparel-variants", count: 24, children: [] },
          { name: "Sportswear", slug: "sportswear", count: 24, children: [] },
          { name: "Streetwear", slug: "streetwear", count: 24, children: [] },
          { name: "Style Trends", slug: "style-trends", count: 24, children: [] },
        ],
      },
      {
        name: "Relationships",
        slug: "relationships",
        count: 159,
        children: [
          { name: "Caregiver", slug: "caregiver", count: 24, children: [] },
          { name: "Chosen family", slug: "chosen-family", count: 24, children: [] },
          { name: "Godparent", slug: "godparent", count: 24, children: [] },
          { name: "Kin Keeper", slug: "kin-keeper", count: 24, children: [] },
          { name: "Mentor", slug: "mentor", count: 24, children: [] },
          { name: "Sister-Friend", slug: "sister-friend", count: 24, children: [] },
          { name: "Work Bestie", slug: "work-bestie", count: 24, children: [] },
        ],
      },
      {
        name: "UnSaid Holidays",
        slug: "unsaid-holidays",
        count: 117,
        children: [
          { name: "All UnSaid Holidays", slug: "all-unsaid-holidays", count: 24, children: [] },
          { name: "Day Ones", slug: "day-ones", count: 24, children: [] },
          { name: "Family by Choice", slug: "family-by-choice", count: 24, children: [] },
          { name: "Just Because", slug: "just-because", count: 24, children: [] },
          { name: "Kin Keeper Month", slug: "kin-keeper-month", count: 24, children: [] },
          { name: "New Year's Day", slug: "new-years-day", count: 24, children: [] },
          { name: "Valentine's Day", slug: "valentines-day", count: 24, children: [] },
          { name: "Easter", slug: "easter", count: 24, children: [] },
          { name: "Mother's Day", slug: "mothers-day", count: 24, children: [] },
          { name: "Father's Day", slug: "fathers-day", count: 24, children: [] },
          { name: "Independence Day", slug: "independence-day", count: 24, children: [] },
          { name: "Veterans Day", slug: "veterans-day", count: 24, children: [] },
          { name: "Halloween", slug: "halloween", count: 24, children: [] },
          { name: "Thanksgiving", slug: "thanksgiving", count: 24, children: [] },
          { name: "Christmas", slug: "christmas", count: 24, children: [] },
        ],
      },
    ],
  },
  {
    name: "Drinkware",
    slug: "drinkware",
    count: 123,
    children: [
      {
        name: "Drinkware & coasters",
        slug: "drinkware-and-coasters",
        count: 118,
        children: [
          { name: "Coasters", slug: "coasters", count: 4, children: [] },
          { name: "Glassware", slug: "glassware", count: 24, children: [] },
          { name: "Mugs", slug: "mugs", count: 60, children: [] },
          { name: "Tumblers", slug: "tumblers", count: 30, children: [] },
          { name: "Water bottles", slug: "water-bottles", count: 3, children: [] },
        ],
      },
      {
        name: "Glassware",
        slug: "glassware",
        count: 24,
        children: [
          { name: "Pint glasses", slug: "pint-glasses", count: 0, children: [] },
        ],
      },
      {
        name: "Mugs",
        slug: "mugs",
        count: 60,
        children: [
          { name: "Ceramic mugs", slug: "ceramic-mugs", count: 0, children: [] },
          { name: "Travel Mugs", slug: "travel-mugs", count: 0, children: [] },
        ],
      },
      { name: "Mugs & Drinkware", slug: "mugs-and-drinkware", count: 0, children: [] },
      {
        name: "Tumblers",
        slug: "tumblers",
        count: 30,
        children: [
          { name: "Bottles", slug: "bottles", count: 0, children: [] },
          { name: "Insulated tumblers", slug: "insulated-tumblers", count: 0, children: [] },
          { name: "Water bottles", slug: "water-bottles", count: 3, children: [] },
        ],
      },
    ],
  },
  {
    name: "Games & Puzzles",
    slug: "games-and-puzzles",
    count: 12,
    children: [
      { name: "Cuddle Toys", slug: "cuddle-toys", count: 0, children: [] },
      {
        name: "Puzzles & Cards",
        slug: "puzzles-and-cards",
        count: 5,
        children: [
          { name: "Jigsaw puzzles", slug: "jigsaw-puzzles", count: 1, children: [] },
        ],
      },
      { name: "Toys & games", slug: "toys-and-games", count: 3, children: [] },
    ],
  },
  {
    name: "Headwear",
    slug: "headwear",
    count: 1607,
    children: [
      { name: "Beanies", slug: "beanies", count: 13, children: [] },
      { name: "Caps", slug: "caps", count: 0, children: [] },
      { name: "Caps & Hats", slug: "caps-and-hats", count: 18, children: [] },
      { name: "Dad hats", slug: "dad-hats", count: 0, children: [] },
      {
        name: "Hats",
        slug: "hats",
        count: 1576,
        children: [
          {
            name: "All hats",
            slug: "all-hats",
            count: 46,
            children: [
              { name: "5-panel hats", slug: "5-panel-hats", count: 2, children: [] },
              { name: "Beanies", slug: "beanies", count: 13, children: [] },
              { name: "Bucket hats", slug: "bucket-hats", count: 6, children: [] },
              { name: "Dad hats / baseball caps", slug: "dad-hats-baseball-caps", count: 22, children: [] },
              { name: "Mesh hats", slug: "mesh-hats", count: 1, children: [] },
              { name: "Snapbacks", slug: "snapbacks", count: 6, children: [] },
              { name: "Trucker hats", slug: "trucker-hats", count: 6, children: [] },
              { name: "Visors", slug: "visors", count: 1, children: [] },
            ],
          },
        ],
      },
      { name: "Kids' Hats", slug: "kids-hats", count: 107, children: [] },
      { name: "Men's Hats", slug: "men-hats", count: 0, children: [] },
      { name: "Women's Hats", slug: "women-hats", count: 0, children: [] },
    ],
  },
  {
    name: "Home & Living",
    slug: "home-and-living",
    count: 153,
    children: [
      { name: "All home & living products", slug: "all-home-and-living-products", count: 7, children: [] },
      { name: "Bathroom", slug: "bathroom", count: 8, children: [] },
      {
        name: "Furniture & Storage",
        slug: "furniture-and-storage",
        count: 0,
        children: [
          {
            name: "Small Home Goods",
            slug: "small-home-goods",
            count: 0,
            children: [
              { name: "Organizers", slug: "organizers", count: 0, children: [] },
              { name: "Shelves", slug: "shelves", count: 0, children: [] },
            ],
          },
        ],
      },
      {
        name: "Home decor",
        slug: "home-decor",
        count: 37,
        children: [
          { name: "Flags & signs", slug: "flags-and-signs", count: 2, children: [] },
          {
            name: "Holiday decor",
            slug: "holiday-decor",
            count: 13,
            children: [
              { name: "Christmas", slug: "christmas", count: 0, children: [] },
              { name: "Christmas Decoration & Gifts", slug: "christmas-decoration-and-gifts", count: 8, children: [] },
            ],
          },
        ],
      },
      {
        name: "Kitchen & Dining",
        slug: "kitchen-and-dining",
        count: 33,
        children: [
          { name: "Aprons", slug: "aprons", count: 14, children: [] },
          { name: "Cutting boards", slug: "cutting-boards", count: 0, children: [] },
          { name: "Placemat sets", slug: "placemat-sets", count: 0, children: [] },
          { name: "Tabletops", slug: "tabletops", count: 0, children: [] },
          { name: "Tableware", slug: "tableware", count: 2, children: [] },
        ],
      },
      {
        name: "Textiles",
        slug: "textiles",
        count: 22,
        children: [
          { name: "Bedding", slug: "bedding", count: 12, children: [] },
          { name: "Blankets", slug: "blankets", count: 6, children: [] },
          { name: "Cushions & Pillows", slug: "cushions-and-pillows", count: 7, children: [] },
          { name: "Home Textiles", slug: "home-textiles", count: 9, children: [] },
          { name: "Pillows", slug: "pillows", count: 1, children: [] },
          { name: "Pillows & pillow cases", slug: "pillows-and-pillow-cases", count: 7, children: [] },
          { name: "Rugs & Blankets", slug: "rugs-and-blankets", count: 0, children: [] },
          { name: "Tea towels", slug: "tea-towels", count: 0, children: [] },
          { name: "Throw blankets", slug: "throw-blankets", count: 0, children: [] },
          { name: "Towels", slug: "towels", count: 2, children: [] },
          { name: "Woven throws", slug: "woven-throws", count: 0, children: [] },
        ],
      },
    ],
  },
  {
    name: "Keepsakes",
    slug: "keepsakes",
    count: 18,
    children: [
      {
        name: "Books & magazines",
        slug: "books-and-magazines",
        count: 14,
        children: [
          { name: "Books", slug: "books", count: 0, children: [] },
          { name: "Hardcover", slug: "hardcover", count: 0, children: [] },
          { name: "Lay Flat Photo book", slug: "lay-flat-photo-book", count: 0, children: [] },
          { name: "Magazines", slug: "magazines", count: 0, children: [] },
          { name: "Softcover", slug: "softcover", count: 0, children: [] },
        ],
      },
      {
        name: "Bundles",
        slug: "bundles",
        count: 1,
        children: [
          { name: "Tee + mug + cap", slug: "tee-+-mug-+-cap", count: 0, children: [] },
          { name: "Themed Kits", slug: "themed-kits", count: 0, children: [] },
        ],
      },
      {
        name: "Digital & Memory",
        slug: "digital-and-memory",
        count: 0,
        children: [
          {
            name: "Digital Keepsakes",
            slug: "digital-keepsakes",
            count: 0,
            children: [
              { name: "Memory Prompts", slug: "memory-prompts", count: 0, children: [] },
              { name: "Story collections", slug: "story-collections", count: 0, children: [] },
            ],
          },
          {
            name: "Memory Links",
            slug: "memory-links",
            count: 0,
            children: [
              { name: "NFC stickers", slug: "nfc-stickers", count: 0, children: [] },
              { name: "Prompt decks", slug: "prompt-decks", count: 0, children: [] },
              { name: "QR & NFC cards", slug: "qr-and-nfc-cards", count: 0, children: [] },
            ],
          },
        ],
      },
      {
        name: "Memory Gifts",
        slug: "memory-gifts",
        count: 1,
        children: [
          { name: "Journals", slug: "journals", count: 0, children: [] },
          { name: "Keychains", slug: "keychains", count: 0, children: [] },
          { name: "Memory boxes", slug: "memory-boxes", count: 0, children: [] },
          { name: "Photo Albums", slug: "photo-albums", count: 0, children: [] },
          {
            name: "Sentimental",
            slug: "sentimental",
            count: 1,
            children: [
              { name: "Bracelets", slug: "bracelets", count: 0, children: [] },
              { name: "Engraved Charms", slug: "engraved-charms", count: 0, children: [] },
              { name: "Lockets", slug: "lockets", count: 0, children: [] },
              { name: "Necklaces", slug: "necklaces", count: 0, children: [] },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Technology",
    slug: "technology",
    count: 19,
    children: [
      { name: "Gaming", slug: "gaming", count: 0, children: [] },
      { name: "Laptop & computer Cases", slug: "laptop-and-computer-cases", count: 1, children: [] },
      { name: "Phone cases", slug: "phone-cases", count: 9, children: [] },
      { name: "Tablet Cases", slug: "tablet-cases", count: 0, children: [] },
      {
        name: "Tech accessories",
        slug: "tech-accessories",
        count: 15,
        children: [
          { name: "Earphone cases", slug: "earphone-cases", count: 2, children: [] },
          { name: "Laptop cases", slug: "laptop-cases", count: 1, children: [] },
          { name: "Mouse pads", slug: "mouse-pads", count: 4, children: [] },
          { name: "Phone cases", slug: "phone-cases", count: 9, children: [] },
        ],
      },
      { name: "Watch Straps", slug: "watch-straps", count: 0, children: [] },
    ],
  },
  {
    name: "Wall Art",
    slug: "wall-art",
    count: 7411,
    children: [
      { name: "Acrylic prints", slug: "acrylic-prints", count: 3, children: [] },
      { name: "Canvas", slug: "canvas", count: 15, children: [] },
      { name: "Display Prints", slug: "display-prints", count: 4, children: [] },
      {
        name: "Décor",
        slug: "décor",
        count: 3,
        children: [
          { name: "Clocks", slug: "clocks", count: 0, children: [] },
          { name: "Framed prints", slug: "framed-prints", count: 5205, children: [] },
          { name: "Frames", slug: "frames", count: 0, children: [] },
          { name: "Ornaments", slug: "ornaments", count: 0, children: [] },
          { name: "Poster prints", slug: "poster-prints", count: 0, children: [] },
          { name: "Signs", slug: "signs", count: 0, children: [] },
          { name: "Wall Art", slug: "wall-art", count: 7411, children: [] },
        ],
      },
      {
        name: "Framed prints",
        slug: "framed-prints",
        count: 5205,
        children: [
          { name: "Aluminum-Framed Posters", slug: "aluminum-framed-posters", count: 1987, children: [] },
          { name: "Wood-Framed Posters", slug: "wood-framed-posters", count: 3200, children: [] },
        ],
      },
      { name: "Metal Prints", slug: "metal-prints", count: 8, children: [] },
      { name: "Photo Tiles", slug: "photo-tiles", count: 0, children: [] },
      { name: "Poster & Wallart", slug: "poster-and-wallart", count: 0, children: [] },
      {
        name: "Prints & posters",
        slug: "prints-and-posters",
        count: 2072,
        children: [
          { name: "Art prints", slug: "art-prints", count: 1346, children: [] },
          { name: "Photo prints", slug: "photo-prints", count: 0, children: [] },
          { name: "Poster hangers", slug: "poster-hangers", count: 1, children: [] },
          { name: "Posters", slug: "posters", count: 730, children: [] },
        ],
      },
      {
        name: "Wall art",
        slug: "wall-art",
        count: 20,
        children: [
          { name: "Canvas prints", slug: "canvas-prints", count: 3, children: [] },
          { name: "Framed posters", slug: "framed-posters", count: 6, children: [] },
          { name: "Metal prints", slug: "metal-prints", count: 1, children: [] },
          { name: "Posters", slug: "posters", count: 730, children: [] },
        ],
      },
      { name: "Wooden Prints", slug: "wooden-prints", count: 0, children: [] },
    ],
  },
  {
    name: "Wellness",
    slug: "wellness",
    count: 5,
    children: [
      {
        name: "Self-Care",
        slug: "self-care",
        count: 5,
        children: [
          { name: "Candles", slug: "candles", count: 3, children: [] },
          { name: "Jar candles", slug: "jar-candles", count: 0, children: [] },
          { name: "Room sprays", slug: "room-sprays", count: 0, children: [] },
          { name: "Spa Sets", slug: "spa-sets", count: 0, children: [] },
        ],
      },
    ],
  },
];

/** A taxonomy node flattened with its URL slug path and 1-based depth. */
export interface FlatTaxonomyNode {
  node: TaxonomyNode;
  /** URL slug path, e.g. ["apparel", "hoodies-and-sweatshirts", "hoodies"]. */
  path: string[];
  /** Name path, e.g. ["Apparel", "Hoodies & Sweatshirts", "Hoodies"]. */
  names: string[];
  depth: number;
}

/** Flatten the whole static tree (265 nodes) in display order. */
export function flattenTaxonomy(): FlatTaxonomyNode[] {
  const out: FlatTaxonomyNode[] = [];
  const walk = (nodes: TaxonomyNode[], path: string[], names: string[], depth: number) => {
    for (const n of nodes) {
      const p = [...path, n.slug];
      const nm = [...names, n.name];
      out.push({ node: n, path: p, names: nm, depth });
      if (n.children?.length) walk(n.children, p, nm, depth + 1);
    }
  };
  walk(taxonomy, [], [], 1);
  return out;
}

/** Total node count of the static tree (spec: 278). */
export function countTaxonomyNodes(): number {
  return flattenTaxonomy().length;
}

/** URL path for a node, e.g. "/shop/apparel/men". */
export function shopPath(path: string[]): string {
  return path.length ? `/shop/${path.join("/")}` : "/shop";
}

/** Find a node by NAME anywhere in the tree, returning the full chain
 *  from the department down to it. Grouping nodes like "Relationships"
 *  and "UnSaid Holidays" are nested under Collections & Occasions —
 *  a top-level-only find() misses them (that is what 404'd every
 *  /relationships/<slug> and /collections/<slug> page). */
export function findNodePathByName(
  name: string,
  nodes: TaxonomyNode[] = taxonomy,
  trail: TaxonomyNode[] = [],
): TaxonomyNode[] | null {
  for (const n of nodes) {
    const t = [...trail, n];
    if (n.name === name) return t;
    const hit = findNodePathByName(name, n.children ?? [], t);
    if (hit) return hit;
  }
  return null;
}

export function findCategoryByPath(slugs: string[]): { node: TaxonomyNode; ancestors: TaxonomyNode[] } | null {
  let nodes = taxonomy;
  let found: TaxonomyNode | null = null;
  const ancestors: TaxonomyNode[] = [];
  for (const slug of slugs) {
    const next = nodes.find(n => n.slug === slug);
    if (!next) return null;
    found = next;
    ancestors.push(found);
    nodes = found.children;
  }
  return found ? { node: found, ancestors: ancestors.slice(0, -1) } : null;
}

export function getChildren(node: TaxonomyNode): TaxonomyNode[] {
  return node.children || [];
}

export function getTopDepartments(): TaxonomyNode[] {
  return taxonomy;
}

