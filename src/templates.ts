/** 按扩展名返回新建文件的默认内容模板 */
export function getTemplateForExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.cs':
      return `using UnityEngine;

public class ClassName
{
}
`;
    case '.shader':
      return `Shader "Custom/NewShader"
{
    Properties
    {
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 100

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
            };

            struct v2f
            {
                float4 vertex : SV_POSITION;
            };

            v2f vert (appdata v)
            {
                v2f o;
                o.vertex = UnityObjectToClipPos(v.vertex);
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                return fixed4(1,1,1,1);
            }
            ENDCG
        }
    }
}
`;
    case '.xml':
      return `<?xml version="1.0" encoding="utf-8"?>
<root>
</root>
`;
    case '.json':
      return `{
}
`;
    case '.txt':
      return '';
    default:
      return '';
  }
}

export const NEW_FILE_EXTENSIONS = [
  { label: 'C# Script (.cs)', ext: '.cs' },
  { label: 'Shader (.shader)', ext: '.shader' },
  { label: 'XML (.xml)', ext: '.xml' },
  { label: 'JSON (.json)', ext: '.json' },
  { label: 'Text (.txt)', ext: '.txt' },
];
