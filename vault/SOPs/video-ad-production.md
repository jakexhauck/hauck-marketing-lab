# Produce a Video Ad with AI

**Category:** Creative
**Source:** Module 5 Lesson 8
**When to use:** Every creative round. At least 3 video ads per 15-ad creative set.
**Estimated time:** 15 to 30 min per video

---

## Prerequisites

- [ ] Ad copy generated (see ad-copy-12-angle-generation)
- [ ] Base image generated for image-to-video (see ad-image-generation)
- [ ] Video tool account: Runway (subtle motion on stills), Kling (people in motion), Pika (free quick effects), Remotion (templated text)
- [ ] CapCut installed (free, for stitching and captions)

## Checklist

- [ ] **Pick the video tool by use case:**
  - [ ] Subtle motion on AI-generated still: Runway
  - [ ] People in motion, 10 to 15 second scenes: Kling
  - [ ] Templated text animation, reusable across clients: Remotion
  - [ ] Quick fun product effects, social: Pika
- [ ] **For Runway image-to-video:**
  - [ ] Go to runway.com, log in
  - [ ] Upload the AI-generated ad image
  - [ ] Select Image to Video
  - [ ] Enter motion prompt (e.g. "slow zoom in, slight camera movement")
  - [ ] Generate, get 4 to 10 second clip
- [ ] **For Remotion templated video:**
  - [ ] Set up Remotion project once (`npx create-video`)
  - [ ] Ask Claude Code to build a 15-second vertical (1080x1920) video with animated headline text, transitions, end card
  - [ ] Swap text for each new client thereafter
- [ ] **Add overlays in Canva Video or CapCut:**
  - [ ] Headline text (matches ad copy)
  - [ ] Caption overlay if any spoken audio
  - [ ] CTA card at the end ("Book Now", "Order Today")
  - [ ] Brand logo small in corner
  - [ ] Music bed (CapCut free library)
- [ ] **Export in both sizes:**
  - [ ] 1080 x 1920 MP4 for stories and reels
  - [ ] 1080 x 1080 MP4 for feed
- [ ] **Upload to Meta Ads Manager as a new ad** under existing ad set
- [ ] **Save source files** to `clients/[name]/creatives/videos-[date]/`

## Notes

- Video beats static 9 out of 10 times on Meta. Hook in first 2 seconds. Show product. End with CTA.
- Hook in first 2 seconds matters more than the rest combined. Test the first frame on a phone before exporting.
- Niche guide: restaurants do slow-mo food and cheese pulls, gyms do quick exercise cuts and transformations, dentists do smile reveals and walkthroughs, med spas do treatment process clips, home services do before/after transitions with pricing overlay.
- Total stack cost: under $30/month vs $400 to $1,200/month for a freelance editor doing 4 videos per client.

## Related SOPs

- ad-copy-12-angle-generation
- ad-image-generation
- vortex-creative-diversity-check
