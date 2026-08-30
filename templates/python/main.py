# Welcome to your Peppl workspace 👋
# Run me from the terminal:  python main.py
import os


def main() -> None:
    print("Hello from Python on Peppl!")
    name = os.environ.get("USER", "world")
    print(f"It works, {name}. Edit main.py and run it again.")


if __name__ == "__main__":
    main()
