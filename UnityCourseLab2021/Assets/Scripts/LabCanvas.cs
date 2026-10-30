using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
namespace UnityCourseLab {
 public sealed class LabCanvas : MonoBehaviour {
  LabRuntime owner;LabObject health,inventory;Image fill;Text healthText,inventoryText,feedback;RectTransform panel;bool wide;
  public void Initialize(LabRuntime runtime,LabObject healthDefinition,LabObject inventoryDefinition){owner=runtime;health=healthDefinition;inventory=inventoryDefinition;
   var canvas=gameObject.AddComponent<Canvas>();canvas.renderMode=RenderMode.ScreenSpaceOverlay;canvas.sortingOrder=10;
   var scaler=gameObject.AddComponent<CanvasScaler>();scaler.uiScaleMode=CanvasScaler.ScaleMode.ScaleWithScreenSize;scaler.referenceResolution=new Vector2(1000,650);scaler.matchWidthOrHeight=.5f;
   gameObject.AddComponent<GraphicRaycaster>();if(FindObjectOfType<EventSystem>()==null){var es=new GameObject("UGUI EventSystem");es.transform.SetParent(transform);es.AddComponent<EventSystem>();es.AddComponent<StandaloneInputModule>();}
   wide=(health!=null&&health.settings.layout=="wide")||(inventory!=null&&inventory.settings.layout=="wide");
   panel=Rect("UGUI experiment",transform,new Vector2(wide?600:330,260));panel.anchorMin=panel.anchorMax=new Vector2(.5f,1);panel.pivot=new Vector2(.5f,1);panel.anchoredPosition=new Vector2(0,-15);var bg=panel.gameObject.AddComponent<Image>();bg.color=new Color(.04f,.08f,.13f,.95f);
   Label("Unity 2021 · UGUI",new Vector2(0,-22));
   if(health!=null){var back=Rect("Health bar",panel,new Vector2(280,22));back.anchoredPosition=new Vector2(0,-58);back.gameObject.AddComponent<Image>().color=Color.gray;
    fill=Rect("Health fill",back,new Vector2(280,22)).gameObject.AddComponent<Image>();fill.color=new Color(.2f,.85f,.4f);fill.rectTransform.anchorMin=new Vector2(0,.5f);fill.rectTransform.anchorMax=new Vector2(0,.5f);fill.rectTransform.pivot=new Vector2(0,.5f);fill.rectTransform.anchoredPosition=Vector2.zero;
    healthText=Label("",new Vector2(0,-86));Button("Damage",new Vector2(health.settings.layout=="wide"?-150:-75,-118),"damage",health.id);Button("Heal",new Vector2(health.settings.layout=="wide"?150:75,-118),"heal",health.id);}
   if(inventory!=null){inventoryText=Label("",new Vector2(0,-155));Button("Add item",new Vector2(inventory.settings.layout=="wide"?-150:-75,-188),"addItem",inventory.id);Button("Remove",new Vector2(inventory.settings.layout=="wide"?150:75,-188),"removeItem",inventory.id);}
   feedback=Label("",new Vector2(0,-230));Refresh();
  }
  RectTransform Rect(string name,Transform parent,Vector2 size){var go=new GameObject(name,typeof(RectTransform));go.transform.SetParent(parent,false);var r=(RectTransform)go.transform;r.sizeDelta=size;r.anchorMin=r.anchorMax=new Vector2(.5f,1);return r;}
  Text Label(string text,Vector2 pos){var r=Rect("Label",panel,new Vector2(wide?560:310,28));r.anchoredPosition=pos;var t=r.gameObject.AddComponent<Text>();t.font=Resources.GetBuiltinResource<Font>("Arial.ttf");t.fontSize=17;t.alignment=TextAnchor.MiddleCenter;t.color=Color.white;t.text=text;t.raycastTarget=false;return t;}
  void Button(string text,Vector2 pos,string action,string id){var r=Rect(text,panel,new Vector2(135,30));r.anchoredPosition=pos;r.gameObject.AddComponent<Image>().color=new Color(.16f,.36f,.6f);var button=r.gameObject.AddComponent<Button>();button.onClick.AddListener(()=>{owner.ApplyUIAction(id,action);Refresh();});var label=Label(text,Vector2.zero);label.transform.SetParent(r,false);label.rectTransform.anchorMin=Vector2.zero;label.rectTransform.anchorMax=Vector2.one;label.rectTransform.offsetMin=label.rectTransform.offsetMax=Vector2.zero;}
  public void Refresh(){if(health!=null){int value=owner.HealthFor(health.id);fill.rectTransform.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal,280f*value/health.settings.maxHealth);healthText.text="Health "+value+" / "+health.settings.maxHealth;}
   if(inventory!=null)inventoryText.text="Inventory "+owner.InventoryFor(inventory.id)+" / "+inventory.settings.capacity;
   if(feedback!=null)feedback.text=owner.InventoryRejected>0?"Rejected items: "+owner.InventoryRejected:"Click buttons to observe real UGUI events";
  }
 }
}


