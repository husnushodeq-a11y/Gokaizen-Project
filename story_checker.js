import instaloader
import sys
import json

username = sys.argv[1]

L = instaloader.Instaloader()
L.load_session_from_file("your_instagram_username")  # harus login dulu sebelumnya dan simpan session

profile = instaloader.Profile.from_username(L.context, username)

story_items = list(L.get_stories(userids=[profile.userid]))

latest_story_url = None
if story_items:
    for story in story_items:
        for item in story.get_items():
            latest_story_url = item.url

print(json.dumps({"story_url": latest_story_url}))
