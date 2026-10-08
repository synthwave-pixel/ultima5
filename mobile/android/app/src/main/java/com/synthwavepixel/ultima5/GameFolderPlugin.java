package com.synthwavepixel.ultima5;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * The installer's Choose folder... on Android (web/src/install/sources.ts androidFolder): the system's own folder
 * picker, which needs no storage permission, and the game's files read out of the folder chosen - the names the page
 * asks for and the Upgrade's music, a few folders down - as base64 for the page to check and install. And Export's
 * To a file (web/src/ui/pageHooks.ts androidSave), which a web view cannot do by itself: the system's own picker for
 * where a new file goes, the saved game written there.
 */
@CapacitorPlugin(name = "GameFolder")
public class GameFolderPlugin extends Plugin {
  @PluginMethod
  public void pick(PluginCall call) {
    startActivityForResult(call, new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), "picked");
  }

  @ActivityCallback
  private void picked(PluginCall call, ActivityResult result) {
    if (call == null) return;
    Intent data = result.getData();
    if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
      JSObject out = new JSObject();
      out.put("cancelled", true);
      call.resolve(out);
      getBridge().releaseCall(call);
      return;
    }
    Uri tree = data.getData();
    Set<String> wanted = new HashSet<>();
    try {
      JSArray names = call.getArray("names");
      for (int i = 0; i < names.length(); i++) wanted.add(names.getString(i).toUpperCase(Locale.ROOT));
    } catch (Exception e) {
      call.reject("No file names given");
      getBridge().releaseCall(call);
      return;
    }
    // Off the main thread: listing a folder and reading its files goes to the document provider, and a broad folder
    // picked by mistake would otherwise hold up the UI past Android's input timeout.
    getBridge().execute(() -> {
      DocumentFile root = DocumentFile.fromTreeUri(getContext(), tree);
      JSArray files = new JSArray();
      try {
        walk(root, "", 0, wanted, files);
      } catch (Exception e) {
        call.reject("Could not read the folder: " + e.getMessage());
        getBridge().releaseCall(call);
        return;
      }
      JSObject out = new JSObject();
      out.put("where", root != null && root.getName() != null ? root.getName() : "the folder chosen");
      out.put("files", files);
      call.resolve(out);
      getBridge().releaseCall(call);
    });
  }

  /** The wanted files under `dir`, as { path, data } with the path from the folder chosen; four folders down at most. */
  private void walk(DocumentFile dir, String prefix, int depth, Set<String> wanted, JSArray out) throws Exception {
    if (dir == null || depth > 4) return;
    for (DocumentFile f : dir.listFiles()) {
      String name = f.getName();
      if (name == null) continue;
      if (f.isDirectory()) {
        walk(f, prefix + name + "/", depth + 1, wanted, out);
      } else {
        String upper = name.toUpperCase(Locale.ROOT);
        if (!wanted.contains(upper) && !upper.endsWith(".XMI")) continue;
        JSObject file = new JSObject();
        file.put("path", prefix + name);
        file.put("data", Base64.encodeToString(read(f.getUri()), Base64.NO_WRAP));
        out.put(file);
      }
    }
  }

  private byte[] read(Uri uri) throws Exception {
    try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
      ByteArrayOutputStream bytes = new ByteArrayOutputStream();
      byte[] buffer = new byte[65536];
      for (int n; in != null && (n = in.read(buffer)) > 0; ) bytes.write(buffer, 0, n);
      return bytes.toByteArray();
    }
  }

  /**
   * The saved game's `text` as a new file where the player chooses, by the system's picker opened at `name`; it needs
   * no storage permission either. Resolves to the file's name as made (the player may change it), or `cancelled`.
   */
  @PluginMethod
  public void saveFile(PluginCall call) {
    if (call.getString("text") == null) {
      call.reject("No text given");
      return;
    }
    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("application/json");
    intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "ultima5.json"));
    try {
      startActivityForResult(call, intent, "made");
    } catch (ActivityNotFoundException e) {
      // A device without the system's file picker (a stripped-down build): the page says no file can be saved here.
      call.reject("No file picker on this device");
      getBridge().releaseCall(call);
    }
  }

  @ActivityCallback
  private void made(PluginCall call, ActivityResult result) {
    if (call == null) return;
    Intent data = result.getData();
    if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
      JSObject out = new JSObject();
      out.put("cancelled", true);
      call.resolve(out);
      getBridge().releaseCall(call);
      return;
    }
    Uri doc = data.getData();
    String text = call.getString("text", "");
    // Off the main thread, as the folder's reading is: the document provider may be a slow one (a cloud drive's).
    getBridge().execute(() -> {
      // The picker makes a new, empty file (another of the same name is given a new one), so plain "w" will do.
      try (OutputStream stream = getContext().getContentResolver().openOutputStream(doc, "w")) {
        if (stream == null) throw new IOException("no stream to write to");
        stream.write(text.getBytes(StandardCharsets.UTF_8));
      } catch (Exception e) {
        // Not left behind empty, the file the picker made for it.
        try {
          DocumentsContract.deleteDocument(getContext().getContentResolver(), doc);
        } catch (Exception ignored) {
          // Gone already, or a provider that will not: the empty file stays.
        }
        call.reject("Could not write the file: " + e.getMessage());
        getBridge().releaseCall(call);
        return;
      }
      DocumentFile file = DocumentFile.fromSingleUri(getContext(), doc);
      String name = file != null ? file.getName() : null;
      JSObject out = new JSObject();
      out.put("name", name != null ? name : call.getString("name", "the file chosen"));
      call.resolve(out);
      getBridge().releaseCall(call);
    });
  }
}
