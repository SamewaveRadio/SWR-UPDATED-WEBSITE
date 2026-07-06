
-- Insert 3 new residents with status NEW from the master host list

INSERT INTO residents (slug, name, bio, image_url, instagram_handle, mixcloud_url, active, show_title, show_description, schedule_text)
VALUES
(
  'kraftwitch',
  'Kraftwitch',
  'Re-imagined hour-long soundtracks inspired by film and character studies.',
  'https://drive.google.com/open?id=1T2grJ44o4vIQ_LSk4-SlX-tWjeLzIbNo',
  'kraftwitch',
  NULL,
  true,
  'Shadow Scores',
  'Re-imagined hour-long soundtracks inspired by film and character studies.',
  'Monthly on the second Friday @ 3pm'
),
(
  'earthtoboy',
  'earthtoboy',
  'With the heartbeat in mind. mirrormirror aims to explore the play between personal moments and their connections to broader culture. Bringing love and attention to their selections, host earthtoboy catalyzes a sonic space for reflection. Take a moment to process it all the way earthtoboy knows best; in the mix.',
  'https://drive.google.com/open?id=14-ICE4kuiBoVxYwmIPEvCYSt8bRR7lqL',
  'earthtoboy',
  NULL,
  true,
  'mirrormirror',
  'With the heartbeat in mind. mirrormirror aims to explore the play between personal moments and their connections to broader culture. Bringing love and attention to their selections, host earthtoboy catalyzes a sonic space for reflection.',
  'Monthly on the first Monday @ 5pm'
),
(
  'blerd',
  'Blerd',
  'Showcasing sounds embedded in Funk and soul, bringing the essence of Chicago House music to my sets.',
  'https://drive.google.com/open?id=1urL5PnWWkk-BU4RKyXTs4T2jUoZ3ydXC',
  'dj_blerd',
  NULL,
  true,
  'Hot House Night',
  'Showcasing sounds embedded in Funk and soul, bringing the essence of Chicago House music to my sets.',
  'Monthly on the fourth Sunday @ 7pm'
);
