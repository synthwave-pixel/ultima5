package com.synthwavepixel.ultima5;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * The game's activity: the web view fills the screen with the system bars hidden (a swipe from an edge shows them
 * for a moment) - hidden again whenever they come back, as on waking from sleep, and at any button or touch after -
 * and the Back button opens the game's Pause menu as Escape does on a keyboard. It carries the GameFolder plugin, the installer's folder picker and Export's file. Everything else is Capacitor's BridgeActivity.
 */
public class MainActivity extends BridgeActivity {
  /** After waking, when the bars are hidden again (ms): the lock screen, and Android putting them back, take a while. */
  private static final long[] AFTER_WAKING = {0, 500, 1500, 3000};

  /** After waking, when the bars are shown and hidden afresh (ms; rehideSystemBars): once the lock screen has gone. */
  private static final long REHIDE_AFTER_WAKING = 1000;

  private final Runnable rehide = this::rehideSystemBars;

  /**
   * The screen coming on, or the lock screen gone: the bars are hidden again, over the next few seconds - and, a
   * moment after, shown and hidden afresh, which Android does not ignore.
   */
  private final BroadcastReceiver woken = new BroadcastReceiver() {
    @Override
    public void onReceive(Context context, Intent intent) {
      hideAfterWaking();
      View decor = getWindow().getDecorView();
      decor.removeCallbacks(rehide);
      decor.postDelayed(rehide, REHIDE_AFTER_WAKING);
    }
  };

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(GameFolderPlugin.class);
    super.onCreate(savedInstanceState);
    hideSystemBars();
    // Whenever the bars come back to stay (a swipe's are only shown for a moment, and leave the insets alone), they
    // are hidden again.
    ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (v, insets) -> {
      if (insets.isVisible(WindowInsetsCompat.Type.systemBars())) v.post(this::hideSystemBars);
      return ViewCompat.onApplyWindowInsets(v, insets);
    });
    IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_ON);
    filter.addAction(Intent.ACTION_USER_PRESENT);
    ContextCompat.registerReceiver(this, woken, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
  }

  @Override
  public void onDestroy() {
    unregisterReceiver(woken);
    super.onDestroy();
  }

  @Override
  public void onResume() {
    super.onResume();
    // Woken from sleep, Android puts the bars back without the window ever losing its focus (an AYN Odin 3, on
    // Android 15), and not always at once: hidden now, and again over the next few seconds.
    hideAfterWaking();
  }

  /**
   * Any button or touch: the bars hidden, should they be showing still - the last word on them, whatever woke the
   * device or put them back - and shown and hidden afresh where they show to stay.
   */
  @Override
  public void onUserInteraction() {
    super.onUserInteraction();
    WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getWindow().getDecorView());
    if (insets != null && insets.isVisible(WindowInsetsCompat.Type.systemBars())) rehideSystemBars();
    else WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).hide(WindowInsetsCompat.Type.systemBars());
  }

  /**
   * The bars shown and, a frame later, hidden again. Woken from sleep, Android can show the bars while the window
   * still asks for them hidden (an AYN Odin 3, on Android 15): asked to hide them again, nothing changes, and it does
   * nothing - as going to the home screen and back puts right. Shown first, the asking changes twice, and is heeded.
   */
  private void rehideSystemBars() {
    WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).show(WindowInsetsCompat.Type.systemBars());
    getWindow().getDecorView().post(this::hideSystemBars);
  }

  private void hideAfterWaking() {
    View decor = getWindow().getDecorView();
    for (long ms : AFTER_WAKING) decor.postDelayed(this::hideSystemBars, ms);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideSystemBars();
  }

  private void hideSystemBars() {
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    controller.hide(WindowInsetsCompat.Type.systemBars());
  }

  @Override
  public boolean onKeyDown(int keyCode, KeyEvent event) {
    if (keyCode == KeyEvent.KEYCODE_BACK) {
      View web = getBridge().getWebView();
      long now = event.getEventTime();
      web.dispatchKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ESCAPE, 0));
      web.dispatchKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ESCAPE, 0));
      return true;
    }
    return super.onKeyDown(keyCode, event);
  }

  @Override
  public boolean onKeyUp(int keyCode, KeyEvent event) {
    if (keyCode == KeyEvent.KEYCODE_BACK) return true;
    return super.onKeyUp(keyCode, event);
  }
}
