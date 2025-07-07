# **App Name**: Doodle Duel

## Core Features:

- Shared Canvas: Real-time canvas for drawing shared among all players.
- Word Display: Display of masked word (underscores), with progressively revealed letters
- Round Management: Round management including timer and score calculation.
- Scoreboard: A display of running scores for all players
- Skip Vote Trigger: AI tool that reviews drawing history during a round, and allows the players to initiate a vote to skip the drawer, if irrelevant scribbling is detected.
- Score persistence: Score Persistence on Rejoin: If a player leaves and rejoins with the same nickname, their previous score and round info should be restored using a session ID (UUID).
- Load Word List: Word is randomly chosen from a local words.txt file.
- Letter Hints: Give hints after reaching half of the guessing time by revealing each random letter

## Style Guidelines:

- Primary color: HSL(210, 75%, 50%) / RGB(32, 144, 240) - A vibrant blue to evoke creativity and fun.  HTML/CSS: --primary-color: hsl(210, 75%, 50%);
- Background color: HSL(210, 20%, 95%) / RGB(242, 247, 255) - Light blue for a clean and non-distracting backdrop. HTML/CSS: --background-color: hsl(210, 20%, 95%);
- Accent color: HSL(180, 60%, 60%) / RGB(61, 191, 179) - A bright turquoise for highlights and active elements. HTML/CSS: --accent-color: hsl(180, 60%, 60%);
- Body and headline font: 'Inter', a grotesque-style sans-serif with a modern, machined, objective, neutral look. HTML/CSS: font-family: 'Inter', sans-serif;
- Simple, clean icons for game actions and alerts. Implementation:  SVG icons or icon fonts (e.g., FontAwesome) styled with CSS.
- Clean layout with scoreboard on the side and the canvas in the center. Implementation: CSS Grid or Flexbox.
- Subtle animations for word reveals and score updates. Implementation: CSS transitions and animations or JavaScript animation libraries.