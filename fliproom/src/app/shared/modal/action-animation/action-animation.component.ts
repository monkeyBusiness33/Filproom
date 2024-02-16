import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {ModalController} from "@ionic/angular";

@Component({
  selector: 'app-action-animation',
  templateUrl: './action-animation.component.html',
  styleUrls: ['./action-animation.component.scss'],
})
export class ActionAnimationComponent implements OnInit {
  private audio: HTMLAudioElement;

  constructor(
    private _modalCtrl: ModalController,
  ) {
  }

  @ViewChild('lottie') lottiePlayer: ElementRef;

  ngAfterViewInit() {
    this.setupAnimationListener();
    this.setupAudio();
    this.startAnimationWithSound();
  }

  ngOnInit() {

  }

  setupAudio() {
    // Initialize the Audio object
    this.audio = new Audio('./assets/audio/success.wav');
    this.audio.load(); // Pre-load the audio
  }

  setupAnimationListener() {
    this.lottiePlayer.nativeElement.addEventListener('load', () => {
      this.lottiePlayer.nativeElement.play();
    });

    this.lottiePlayer.nativeElement.addEventListener('complete', () => {
      this.onAnimationFinished();
    });
  }

  startAnimationWithSound() {
    // You might want to check if the animation and audio are ready to play
    // If the audio is not loaded yet, it will not play immediately
    this.audio.play(); // Play the sound when the animation starts
    this.lottiePlayer.nativeElement.play(); // Start playing the Lottie animation
  }


  onAnimationFinished() {
    this._modalCtrl.dismiss(null, 'submit');
  }
}
